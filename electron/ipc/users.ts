import { registerHandler } from "./register";
import {
  IPC,
  type ActionResult,
  type AppUser,
  type PermissionInfo,
  type RoleInfo,
  type UserCreateInput,
  type UserUpdateInput,
} from "../../shared/ipc";
import { getDb } from "../db";
import {
  UsersError,
  createUser,
  listPermissions,
  listRoles,
  listUsers,
  setRolePermissions,
  setUserPassword,
  updateUser,
} from "../db/users";
import { PermissionError, requirePermission } from "./session";

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

function asError(err: unknown): string {
  if (err instanceof PermissionError || err instanceof UsersError) return err.message;
  if (err instanceof Error) return err.message;
  return "Unexpected user error";
}

export function registerUserHandlers(): void {
  registerHandler(IPC.USERS_LIST, async (): Promise<ActionResult<AppUser[]>> => {
    try {
      requirePermission("users.manage");
      return ok(listUsers(getDb()));
    } catch (err) {
      return fail(asError(err));
    }
  });

  registerHandler(IPC.ROLES_LIST, async (): Promise<ActionResult<RoleInfo[]>> => {
    try {
      const session = requirePermission("users.manage");
      const all = listRoles(getDb());
      if (session.roleName === "Super Admin") return ok(all);
      return ok(all.filter((r) => r.name !== "Super Admin"));
    } catch (err) {
      return fail(asError(err));
    }
  });

  registerHandler(IPC.PERMISSIONS_LIST, async (): Promise<ActionResult<PermissionInfo[]>> => {
    try {
      requirePermission("users.manage");
      return ok(listPermissions(getDb()));
    } catch (err) {
      return fail(asError(err));
    }
  });

  registerHandler(
    IPC.ROLES_SET_PERMISSIONS,
    async (_e, roleId: string, permissionCodes: string[]): Promise<ActionResult<RoleInfo>> => {
      try {
        const session = requirePermission("users.manage");
        if (!roleId) return fail("Role is required");
        return ok(setRolePermissions(getDb(), roleId, permissionCodes ?? [], session.id));
      } catch (err) {
        return fail(asError(err));
      }
    }
  );

  registerHandler(
    IPC.USERS_CREATE,
    async (_e, input: UserCreateInput): Promise<ActionResult<AppUser>> => {
      try {
        const session = requirePermission("users.manage");
        return ok(await createUser(getDb(), input, session.id));
      } catch (err) {
        return fail(asError(err));
      }
    }
  );

  registerHandler(
    IPC.USERS_UPDATE,
    async (_e, id: string, input: UserUpdateInput): Promise<ActionResult<AppUser>> => {
      try {
        const session = requirePermission("users.manage");
        return ok(await updateUser(getDb(), id, input, session.id));
      } catch (err) {
        return fail(asError(err));
      }
    }
  );

  registerHandler(
    IPC.USERS_SET_PASSWORD,
    async (_e, id: string, password: string): Promise<ActionResult> => {
      try {
        const session = requirePermission("users.manage");
        await setUserPassword(getDb(), id, password, session.id);
        return ok(undefined);
      } catch (err) {
        return fail(asError(err));
      }
    }
  );
}
