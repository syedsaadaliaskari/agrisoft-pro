import bcrypt from "bcryptjs";
import { and, asc, count, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import type { Db } from "./index";
import { permissions, rolePermissions, roles, users } from "./schema";
import type {
  AppUser,
  PermissionInfo,
  RoleInfo,
  UserCreateInput,
  UserUpdateInput,
} from "../../shared/ipc";
import { writeAuditLog } from "./audit";

export class UsersError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsersError";
  }
}

function mapUser(
  row: typeof users.$inferSelect,
  roleName: string
): AppUser {
  return {
    id: row.id,
    username: row.username,
    fullName: row.fullName,
    email: row.email,
    phone: row.phone,
    roleId: row.roleId,
    roleName,
    isActive: row.isActive,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listUsers(db: Db): AppUser[] {
  return db
    .select({
      user: users,
      roleName: roles.name,
    })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .orderBy(asc(users.username))
    .all()
    .map((r) => mapUser(r.user, r.roleName));
}

export function listRoles(db: Db): RoleInfo[] {
  const roleRows = db.select().from(roles).orderBy(asc(roles.name)).all();
  return roleRows.map((role) => {
    const perms = db
      .select({ code: permissions.code })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(rolePermissions.roleId, role.id))
      .all();
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      permissions: perms.map((p) => p.code).sort(),
    };
  });
}

export function listPermissions(db: Db): PermissionInfo[] {
  const rows = db.select().from(permissions).orderBy(asc(permissions.module), asc(permissions.code)).all();
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    module: r.module,
    description: r.description,
  }));
}

export function setRolePermissions(
  db: Db,
  roleId: string,
  permissionCodes: string[],
  actorId: string | null
): RoleInfo {
  const role = db.select().from(roles).where(eq(roles.id, roleId)).get();
  if (!role) throw new UsersError("Role not found");

  const codes = [...new Set(permissionCodes.map((c) => c.trim()).filter(Boolean))];

  // Admin must keep users.manage so the system is not locked out
  if (role.name === "Admin" && !codes.includes("users.manage")) {
    codes.push("users.manage");
  }

  // Super Admin always keeps full catalog (License + Activated + everything)
  if (role.name === "Super Admin") {
    const allCodes = db.select({ code: permissions.code }).from(permissions).all().map((p) => p.code);
    for (const code of allCodes) {
      if (!codes.includes(code)) codes.push(code);
    }
  }

  if (codes.length === 0) {
    throw new UsersError("Select at least one permission");
  }

  const permRows = db.select().from(permissions).all();
  const byCode = new Map(permRows.map((p) => [p.code, p]));
  const missing = codes.filter((c) => !byCode.has(c));
  if (missing.length) {
    throw new UsersError(`Unknown permission(s): ${missing.join(", ")}`);
  }

  db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId)).run();
  db.insert(rolePermissions)
    .values(
      codes.map((code) => ({
        id: randomUUID(),
        roleId,
        permissionId: byCode.get(code)!.id,
      }))
    )
    .run();

  writeAuditLog(db, {
    userId: actorId,
    action: "update_permissions",
    module: "roles",
    entityId: roleId,
    details: `Updated permissions for role ${role.name} (${codes.length} codes)`,
  });

  return listRoles(db).find((r) => r.id === roleId)!;
}

function countActiveAdmins(db: Db): number {
  const adminRole = db.select().from(roles).where(eq(roles.name, "Admin")).get();
  if (!adminRole) return 0;
  return (
    db
      .select({ value: count() })
      .from(users)
      .where(and(eq(users.roleId, adminRole.id), eq(users.isActive, true)))
      .get()?.value ?? 0
  );
}

function isAdminRole(db: Db, roleId: string): boolean {
  const role = db.select().from(roles).where(eq(roles.id, roleId)).get();
  return role?.name === "Admin";
}

export async function createUser(
  db: Db,
  input: UserCreateInput,
  actorId: string | null
): Promise<AppUser> {
  const username = input.username?.trim();
  const fullName = input.fullName?.trim();
  const password = input.password ?? "";

  if (!username) throw new UsersError("Username is required");
  if (!fullName) throw new UsersError("Full name is required");
  if (password.length < 4) throw new UsersError("Password must be at least 4 characters");
  if (!input.roleId) throw new UsersError("Role is required");

  const role = db.select().from(roles).where(eq(roles.id, input.roleId)).get();
  if (!role) throw new UsersError("Role not found");

  const existing = db.select().from(users).where(eq(users.username, username)).get();
  if (existing) throw new UsersError("Username already exists");

  const now = new Date().toISOString();
  const id = randomUUID();
  const passwordHash = await bcrypt.hash(password, 10);

  db.insert(users)
    .values({
      id,
      username,
      passwordHash,
      fullName,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      roleId: input.roleId,
      isActive: input.isActive !== false,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  writeAuditLog(db, {
    userId: actorId,
    action: "create",
    module: "users",
    entityId: id,
    details: `Created user ${username} (${role.name})`,
  });

  return mapUser(db.select().from(users).where(eq(users.id, id)).get()!, role.name);
}

export async function updateUser(
  db: Db,
  id: string,
  input: UserUpdateInput,
  actorId: string | null
): Promise<AppUser> {
  const current = db
    .select({ user: users, roleName: roles.name })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(eq(users.id, id))
    .get();
  if (!current) throw new UsersError("User not found");

  const nextRoleId = input.roleId ?? current.user.roleId;
  const nextActive = input.isActive === undefined ? current.user.isActive : input.isActive;
  const wasAdmin = isAdminRole(db, current.user.roleId) && current.user.isActive;
  const willBeAdmin = isAdminRole(db, nextRoleId) && nextActive;

  if (wasAdmin && !willBeAdmin && countActiveAdmins(db) <= 1) {
    throw new UsersError("Cannot remove or deactivate the last active Admin");
  }

  if (input.roleId) {
    const role = db.select().from(roles).where(eq(roles.id, input.roleId)).get();
    if (!role) throw new UsersError("Role not found");
  }

  const fullName =
    input.fullName === undefined ? current.user.fullName : input.fullName.trim();
  if (!fullName) throw new UsersError("Full name is required");

  const now = new Date().toISOString();
  db.update(users)
    .set({
      fullName,
      roleId: nextRoleId,
      email: input.email === undefined ? current.user.email : input.email?.trim() || null,
      phone: input.phone === undefined ? current.user.phone : input.phone?.trim() || null,
      isActive: nextActive,
      updatedAt: now,
    })
    .where(eq(users.id, id))
    .run();

  writeAuditLog(db, {
    userId: actorId,
    action: "update",
    module: "users",
    entityId: id,
    details: `Updated user ${current.user.username}`,
  });

  const updated = db
    .select({ user: users, roleName: roles.name })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(eq(users.id, id))
    .get()!;
  return mapUser(updated.user, updated.roleName);
}

export async function setUserPassword(
  db: Db,
  id: string,
  password: string,
  actorId: string | null
): Promise<void> {
  if (!password || password.length < 4) {
    throw new UsersError("Password must be at least 4 characters");
  }
  const user = db.select().from(users).where(eq(users.id, id)).get();
  if (!user) throw new UsersError("User not found");

  const passwordHash = await bcrypt.hash(password, 10);
  db.update(users)
    .set({ passwordHash, updatedAt: new Date().toISOString() })
    .where(eq(users.id, id))
    .run();

  writeAuditLog(db, {
    userId: actorId,
    action: "set_password",
    module: "users",
    entityId: id,
    details: `Password reset for ${user.username}`,
  });
}

/** Logged-in user changes their own password (must prove current password). */
export async function changeOwnPassword(
  db: Db,
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  if (!newPassword || newPassword.length < 4) {
    throw new UsersError("New password must be at least 4 characters");
  }
  if (currentPassword === newPassword) {
    throw new UsersError("New password must be different from current password");
  }

  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user || !user.isActive) throw new UsersError("User not found");

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new UsersError("Current password is incorrect");

  const passwordHash = await bcrypt.hash(newPassword, 10);
  db.update(users)
    .set({ passwordHash, updatedAt: new Date().toISOString() })
    .where(eq(users.id, userId))
    .run();

  writeAuditLog(db, {
    userId,
    action: "change_password",
    module: "users",
    entityId: userId,
    details: `Password changed by ${user.username}`,
  });
}
