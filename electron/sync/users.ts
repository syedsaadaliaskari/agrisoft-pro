import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { permissions, rolePermissions, roles, users } from "../db/schema";
import { supabaseRest, supabaseUpsert, tenantId } from "./client";
import {
  beginTableDeletes,
  fetchCloudDeletedIds,
  finishTableSnapshot,
  liveRows,
  pushTableTombstones,
  shouldRemoveLocal,
} from "./deletes";
import { fetchTenantRows } from "./pull";
import { isNewer } from "./store";

type CloudPermission = { id: string; code: string; module: string; description: string | null };
type CloudRole = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
type CloudRolePerm = {
  id: string;
  tenant_id: string;
  role_id: string;
  permission_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
type CloudUser = {
  id: string;
  tenant_id: string;
  username: string;
  password_hash: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role_id: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

function isSuperAdminRoleName(name: string) {
  return name.trim().toLowerCase() === "super admin";
}

async function permissionCodeMaps() {
  const db = getDb();
  const local = db.select().from(permissions).all();
  const localByCode = new Map(local.map((row) => [row.code, row]));
  let remote: CloudPermission[] = [];
  try {
    remote = await supabaseRest<CloudPermission[]>("permissions", {
      query: "select=id,code,module,description",
    });
  } catch {
    remote = [];
  }
  const cloudByCode = new Map((remote || []).map((row) => [row.code, row]));

  const missing = local.filter((row) => !cloudByCode.has(row.code));
  if (missing.length) {
    await supabaseUpsert(
      "permissions",
      missing.map((row) => ({
        id: row.id,
        code: row.code,
        module: row.module,
        description: row.description,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }))
    );
    for (const row of missing) {
      cloudByCode.set(row.code, {
        id: row.id,
        code: row.code,
        module: row.module,
        description: row.description,
      });
    }
  }

  const localIdToCloudId = new Map<string, string>();
  const cloudIdToLocalId = new Map<string, string>();
  for (const row of local) {
    const cloud = cloudByCode.get(row.code);
    if (!cloud) continue;
    localIdToCloudId.set(row.id, cloud.id);
    cloudIdToLocalId.set(cloud.id, row.id);
  }
  return { localIdToCloudId, cloudIdToLocalId };
}

export async function syncUsers(): Promise<{ pushed: number; pulled: number }> {
  const tid = tenantId();
  const db = getDb();
  const { localIdToCloudId, cloudIdToLocalId } = await permissionCodeMaps();

  const localRoles = db
    .select()
    .from(roles)
    .all()
    .filter((row) => !isSuperAdminRoleName(row.name));
  beginTableDeletes("roles", localRoles.map((row) => row.id));
  await pushTableTombstones("roles");

  const remoteRoles = (await fetchTenantRows<CloudRole>("roles")).filter(
    (row) => !isSuperAdminRoleName(row.name)
  );
  const cloudRoleIds = new Set(remoteRoles.map((row) => row.id));
  const deletedRoles = await fetchCloudDeletedIds("roles");

  let pulled = 0;
  for (const row of remoteRoles) {
    const existing = db.select().from(roles).where(eq(roles.id, row.id)).get();
    const nameClash = db.select().from(roles).where(eq(roles.name, row.name)).get();
    if (nameClash && nameClash.id !== row.id) {
      if (isSuperAdminRoleName(nameClash.name)) continue;
      db.delete(rolePermissions).where(eq(rolePermissions.roleId, nameClash.id)).run();
      db.delete(roles).where(eq(roles.id, nameClash.id)).run();
    }
    const mapped = {
      id: row.id,
      name: row.name,
      description: row.description,
      isSystem: Boolean(row.is_system),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    if (!existing) {
      db.insert(roles).values(mapped).run();
      pulled += 1;
    } else if (isNewer(row.updated_at, existing.updatedAt)) {
      db.update(roles).set(mapped).where(eq(roles.id, row.id)).run();
      pulled += 1;
    }
  }

  for (const row of db.select().from(roles).all()) {
    if (isSuperAdminRoleName(row.name)) continue;
    if (deletedRoles.has(row.id) || shouldRemoveLocal("roles", row.id, row.updatedAt, cloudRoleIds)) {
      db.delete(rolePermissions).where(eq(rolePermissions.roleId, row.id)).run();
      db.delete(roles).where(eq(roles.id, row.id)).run();
    }
  }

  const remainingRoles = liveRows(
    "roles",
    db
      .select()
      .from(roles)
      .all()
      .filter((row) => !isSuperAdminRoleName(row.name))
  );
  await supabaseUpsert(
    "roles",
    remainingRoles.map((row) => ({
      id: row.id,
      tenant_id: tid,
      name: row.name,
      description: row.description,
      is_system: row.isSystem,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
      deleted_at: null,
    }))
  );
  finishTableSnapshot(
    "roles",
    remainingRoles.map((row) => row.id)
  );

  const localPerms = db.select().from(rolePermissions).all();
  beginTableDeletes("role_permissions", localPerms.map((row) => row.id));
  await pushTableTombstones("role_permissions");

  const remotePerms = await fetchTenantRows<CloudRolePerm>("role_permissions");
  const cloudPermIds = new Set(remotePerms.map((row) => row.id));
  const deletedPerms = await fetchCloudDeletedIds("role_permissions");
  const shopRoleIds = new Set(remainingRoles.map((row) => row.id));

  for (const row of remotePerms) {
    if (!shopRoleIds.has(row.role_id) && !db.select().from(roles).where(eq(roles.id, row.role_id)).get()) {
      continue;
    }
    const role = db.select().from(roles).where(eq(roles.id, row.role_id)).get();
    if (!role || isSuperAdminRoleName(role.name)) continue;
    const localPermissionId = cloudIdToLocalId.get(row.permission_id);
    if (!localPermissionId) continue;
    const existing = db.select().from(rolePermissions).where(eq(rolePermissions.id, row.id)).get();
    const mapped = {
      id: row.id,
      roleId: row.role_id,
      permissionId: localPermissionId,
    };
    if (!existing) {
      const clash = db
        .select()
        .from(rolePermissions)
        .where(eq(rolePermissions.roleId, row.role_id))
        .all()
        .find((p) => p.permissionId === localPermissionId);
      if (clash && clash.id !== row.id) {
        db.delete(rolePermissions).where(eq(rolePermissions.id, clash.id)).run();
      }
      db.insert(rolePermissions).values(mapped).run();
      pulled += 1;
    }
  }

  for (const row of db.select().from(rolePermissions).all()) {
    const role = db.select().from(roles).where(eq(roles.id, row.roleId)).get();
    if (role && isSuperAdminRoleName(role.name)) continue;
    if (
      deletedPerms.has(row.id) ||
      shouldRemoveLocal("role_permissions", row.id, row.id, cloudPermIds)
    ) {
      db.delete(rolePermissions).where(eq(rolePermissions.id, row.id)).run();
    }
  }

  const remainingRolePerms = liveRows("role_permissions", db.select().from(rolePermissions).all()).filter(
    (row) => {
      const role = db.select().from(roles).where(eq(roles.id, row.roleId)).get();
      return role && !isSuperAdminRoleName(role.name);
    }
  );
  const now = new Date().toISOString();
  await supabaseUpsert(
    "role_permissions",
    remainingRolePerms
      .map((row) => {
        const cloudPermissionId = localIdToCloudId.get(row.permissionId);
        if (!cloudPermissionId) return null;
        return {
          id: row.id,
          tenant_id: tid,
          role_id: row.roleId,
          permission_id: cloudPermissionId,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
  );
  finishTableSnapshot(
    "role_permissions",
    remainingRolePerms.map((row) => row.id)
  );

  const localUsers = db.select().from(users).all().filter((row) => {
    const role = db.select().from(roles).where(eq(roles.id, row.roleId)).get();
    return !role || !isSuperAdminRoleName(role.name);
  });
  beginTableDeletes("users", localUsers.map((row) => row.id));
  await pushTableTombstones("users");

  const remoteUsers = await fetchTenantRows<CloudUser>("users");
  const cloudUserIds = new Set(remoteUsers.map((row) => row.id));
  const deletedUsers = await fetchCloudDeletedIds("users");

  for (const row of remoteUsers) {
    const role = db.select().from(roles).where(eq(roles.id, row.role_id)).get();
    if (!role || isSuperAdminRoleName(role.name)) continue;
    const existing = db.select().from(users).where(eq(users.id, row.id)).get();
    const nameClash = db.select().from(users).where(eq(users.username, row.username.toLowerCase())).get();
    if (nameClash && nameClash.id !== row.id) {
      db.delete(users).where(eq(users.id, nameClash.id)).run();
    }
    const mapped = {
      id: row.id,
      username: row.username.toLowerCase(),
      passwordHash: row.password_hash,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      roleId: row.role_id,
      isActive: Boolean(row.is_active),
      lastLoginAt: row.last_login_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    if (!existing) {
      db.insert(users).values(mapped).run();
      pulled += 1;
    } else if (isNewer(row.updated_at, existing.updatedAt)) {
      db.update(users).set(mapped).where(eq(users.id, row.id)).run();
      pulled += 1;
    }
  }

  for (const row of db.select().from(users).all()) {
    const role = db.select().from(roles).where(eq(roles.id, row.roleId)).get();
    if (role && isSuperAdminRoleName(role.name)) continue;
    if (deletedUsers.has(row.id) || shouldRemoveLocal("users", row.id, row.updatedAt, cloudUserIds)) {
      db.delete(users).where(eq(users.id, row.id)).run();
    }
  }

  const remainingUsers = liveRows("users", db.select().from(users).all()).filter((row) => {
    const role = db.select().from(roles).where(eq(roles.id, row.roleId)).get();
    return !role || !isSuperAdminRoleName(role.name);
  });
  const pushed = await supabaseUpsert(
    "users",
    remainingUsers.map((row) => ({
      id: row.id,
      tenant_id: tid,
      username: row.username,
      password_hash: row.passwordHash,
      full_name: row.fullName,
      email: row.email,
      phone: row.phone,
      role_id: row.roleId,
      is_active: row.isActive,
      last_login_at: row.lastLoginAt,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
      deleted_at: null,
    }))
  );
  finishTableSnapshot(
    "users",
    remainingUsers.map((row) => row.id)
  );

  return { pushed, pulled };
}
