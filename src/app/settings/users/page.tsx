"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { ExportMenu } from "@/components/ExportMenu";
import { Alert, Button, DataTable, Input, Select } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import type { AppUser, PermissionInfo, RoleInfo } from "@shared/ipc";

function groupByModule(perms: PermissionInfo[]) {
  const map = new Map<string, PermissionInfo[]>();
  for (const p of perms) {
    const list = map.get(p.module) ?? [];
    list.push(p);
    map.set(p.module, list);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export default function UsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [permissions, setPermissions] = useState<PermissionInfo[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    username: "",
    fullName: "",
    password: "",
    roleId: "",
    email: "",
    phone: "",
    isActive: true,
  });
  const [passwordOnly, setPasswordOnly] = useState("");
  const [roleDrafts, setRoleDrafts] = useState<Record<string, string[]>>({});
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");
    const [u, r, p] = await Promise.all([
      getApi().listUsers(),
      getApi().listRoles(),
      getApi().listPermissions(),
    ]);
    if (!u.ok) {
      setError(u.error);
      return;
    }
    if (!r.ok) {
      setError(r.error);
      return;
    }
    if (!p.ok) {
      setError(p.error);
      return;
    }
    setUsers(u.data);
    setRoles(r.data);
    setPermissions(p.data);
    setRoleDrafts(
      Object.fromEntries(r.data.map((role) => [role.id, [...role.permissions]]))
    );
    if (!form.roleId && r.data[0]) {
      setForm((f) => ({ ...f, roleId: r.data[0]!.id }));
    }
  }, [form.roleId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const permissionGroups = useMemo(() => groupByModule(permissions), [permissions]);

  const selectedRole = roles.find((r) => r.id === form.roleId) ?? null;
  const selectedRolePerms = form.roleId ? roleDrafts[form.roleId] ?? selectedRole?.permissions ?? [] : [];

  const resetForm = () => {
    setEditingId(null);
    setPasswordOnly("");
    setForm({
      username: "",
      fullName: "",
      password: "",
      roleId: roles[0]?.id ?? "",
      email: "",
      phone: "",
      isActive: true,
    });
  };

  const startEdit = (user: AppUser) => {
    setEditingId(user.id);
    setPasswordOnly("");
    setForm({
      username: user.username,
      fullName: user.fullName,
      password: "",
      roleId: user.roleId,
      email: user.email ?? "",
      phone: user.phone ?? "",
      isActive: user.isActive,
    });
    setSuccess("");
    setError("");
  };

  const toggleRolePerm = (roleId: string, code: string) => {
    setRoleDrafts((prev) => {
      const current = new Set(prev[roleId] ?? []);
      if (current.has(code)) current.delete(code);
      else current.add(code);
      return { ...prev, [roleId]: [...current].sort() };
    });
  };

  const setAllRolePerms = (roleId: string, on: boolean) => {
    setRoleDrafts((prev) => ({
      ...prev,
      [roleId]: on ? permissions.map((p) => p.code) : [],
    }));
  };

  const saveRolePermissions = async (roleId: string) => {
    setSavingRoleId(roleId);
    setError("");
    setSuccess("");
    const codes = roleDrafts[roleId] ?? [];
    const res = await getApi().setRolePermissions(roleId, codes);
    setSavingRoleId(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSuccess(`Permissions saved for ${res.data.name}`);
    void load();
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (editingId) {
      const res = await getApi().updateUser(editingId, {
        fullName: form.fullName,
        roleId: form.roleId,
        email: form.email || null,
        phone: form.phone || null,
        isActive: form.isActive,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (passwordOnly.trim()) {
        const pw = await getApi().setUserPassword(editingId, passwordOnly.trim());
        if (!pw.ok) {
          setError(pw.error);
          return;
        }
      }
      setSuccess("User updated");
    } else {
      const res = await getApi().createUser({
        username: form.username.trim(),
        fullName: form.fullName.trim(),
        password: form.password,
        roleId: form.roleId,
        email: form.email || null,
        phone: form.phone || null,
        isActive: form.isActive,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess("User created");
    }
    resetForm();
    void load();
  };

  return (
    <AppShell title="Users & RBAC" subtitle="Manage users and role access" permission="users.manage">
      <div className="space-y-6">
        {error ? <Alert>{error}</Alert> : null}
        {success ? <Alert tone="info">{success}</Alert> : null}

        <form
          onSubmit={onSubmit}
          className="grid max-w-3xl gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 sm:grid-cols-2"
        >
          <div className="sm:col-span-2 text-sm font-semibold">
            {editingId ? "Edit user" : "Create user"}
          </div>
          <Input
            label="Username"
            value={form.username}
            disabled={!!editingId}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            required={!editingId}
          />
          <Input
            label="Full name"
            value={form.fullName}
            onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
            required
          />
          {!editingId ? (
            <Input
              label="Password"
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              required
            />
          ) : (
            <Input
              label="New password (optional)"
              type="password"
              value={passwordOnly}
              onChange={(e) => setPasswordOnly(e.target.value)}
            />
          )}
          <Select
            label="Role"
            value={form.roleId}
            onChange={(e) => setForm((f) => ({ ...f, roleId: e.target.value }))}
            options={roles.map((r) => ({ value: r.id, label: r.name }))}
          />
          <Input
            label="Email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
          <Input
            label="Phone"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
          <label className="flex items-center gap-2 text-sm text-[var(--text-muted)] sm:col-span-2">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            Active
          </label>

          {selectedRole ? (
            <div className="sm:col-span-2 rounded-lg border border-[var(--border)] bg-[var(--bg-soft)] p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Access for role: {selectedRole.name}
              </div>
              <p className="mb-3 text-xs text-[var(--text-muted)]">
                This user will see menus and screens allowed for this role. Edit the role checklist
                below to change what they can access.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {selectedRolePerms.length ? (
                  selectedRolePerms.map((code) => (
                    <span
                      key={code}
                      className="rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]"
                    >
                      {code}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-[var(--danger)]">No permissions selected for this role</span>
                )}
              </div>
            </div>
          ) : null}

          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit">{editingId ? "Save user" : "Create user"}</Button>
            {editingId ? (
              <Button type="button" variant="secondary" onClick={resetForm}>
                Cancel
              </Button>
            ) : null}
          </div>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Users</h2>
          <ExportMenu
            filename="users"
            title="Users"
            columns={[
              { key: "username", label: "Username" },
              { key: "fullName", label: "Name" },
              { key: "email", label: "Email" },
              { key: "phone", label: "Phone" },
              { key: "roleName", label: "Role" },
              { key: "status", label: "Status" },
              { key: "lastLoginAt", label: "Last login" },
            ]}
            rows={users.map((u) => ({
              username: u.username,
              fullName: u.fullName,
              email: u.email ?? "",
              phone: u.phone ?? "",
              roleName: u.roleName,
              status: u.isActive ? "Active" : "Inactive",
              lastLoginAt: u.lastLoginAt ? u.lastLoginAt.replace("T", " ").slice(0, 19) : "",
            }))}
          />
        </div>

        <DataTable
          headers={["Username", "Name", "Email", "Phone", "Role", "Status", "Last login", ""]}
          empty={!users.length}
        >
          {users.map((u) => (
            <tr key={u.id} className="border-b border-[var(--border)] last:border-0">
              <td className="px-4 py-2.5 font-medium">{u.username}</td>
              <td className="px-4 py-2.5">{u.fullName}</td>
              <td className="px-4 py-2.5 text-[var(--text-muted)]">{u.email || "-"}</td>
              <td className="px-4 py-2.5 text-[var(--text-muted)]">{u.phone || "-"}</td>
              <td className="px-4 py-2.5">{u.roleName}</td>
              <td className="px-4 py-2.5">{u.isActive ? "Active" : "Inactive"}</td>
              <td className="px-4 py-2.5 text-[var(--text-muted)]">
                {u.lastLoginAt ? u.lastLoginAt.replace("T", " ").slice(0, 19) : "-"}
              </td>
              <td className="px-4 py-2.5">
                <Button type="button" size="sm" variant="ghost" onClick={() => startEdit(u)}>
                  Edit
                </Button>
              </td>
            </tr>
          ))}
        </DataTable>

        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Role access menu</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Tick what each role can see and do - same options Admin has. Changes apply to all users
              with that role.
            </p>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {roles.map((role) => {
              const draft = roleDrafts[role.id] ?? role.permissions;
              const draftSet = new Set(draft);
              return (
                <div
                  key={role.id}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4"
                >
                  <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{role.name}</div>
                      <div className="text-xs text-[var(--text-muted)]">{role.description}</div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => setAllRolePerms(role.id, true)}
                      >
                        All
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => setAllRolePerms(role.id, false)}
                      >
                        None
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={savingRoleId === role.id}
                        onClick={() => void saveRolePermissions(role.id)}
                      >
                        {savingRoleId === role.id ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 space-y-3">
                    {permissionGroups.map(([module, perms]) => (
                      <div key={module}>
                        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                          {module}
                        </div>
                        <div className="grid gap-1.5 sm:grid-cols-2">
                          {perms.map((perm) => (
                            <label
                              key={perm.code}
                              className="flex cursor-pointer items-start gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-soft)] px-2.5 py-2 text-xs"
                            >
                              <input
                                type="checkbox"
                                className="mt-0.5"
                                checked={draftSet.has(perm.code)}
                                onChange={() => toggleRolePerm(role.id, perm.code)}
                              />
                              <span>
                                <span className="block font-medium text-[var(--text)]">{perm.code}</span>
                                <span className="text-[var(--text-muted)]">
                                  {perm.description || "-"}
                                </span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
