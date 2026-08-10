"use client";

import { useState } from "react";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Alert, Button, Input } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

export default function ChangePasswordPage() {
  const user = useAuthStore((s) => s.user);
  const hydrate = useAuthStore((s) => s.hydrate);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const forced = !!user?.mustChangePassword;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (newPassword.length < 4) {
      setError("New password must be at least 4 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match");
      return;
    }

    setSaving(true);
    const res = await getApi().changePassword(currentPassword, newPassword);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSuccess("Password updated");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    await hydrate();
  };

  return (
    <AppShell title="Change password" subtitle="Update the password for your signed-in account">
      <div className="mx-auto max-w-lg space-y-5">
        {forced ? (
          <Alert tone="info">
            For security, change the default password before using the shop (client installs start
            with a temporary password).
          </Alert>
        ) : null}
        {error ? <Alert>{error}</Alert> : null}
        {success ? <Alert tone="info">{success}</Alert> : null}

        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
              <KeyRound size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold">Update password</div>
              <div className="text-xs text-[var(--text-muted)]">
                Signed in as <span className="font-medium text-[var(--text)]">{user?.username}</span>
              </div>
            </div>
          </div>

          <form onSubmit={onSubmit} className="space-y-4" autoComplete="off">
            <Input
              label="Current password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <Input
              label="New password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
            <Input
              label="Confirm new password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Update password"}
              </Button>
              {!forced ? (
                <Link
                  href="/settings"
                  className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--bg-soft)] px-3.5 py-2 text-sm text-[var(--text)] hover:border-[var(--border-strong)]"
                >
                  Back to Settings
                </Link>
              ) : null}
            </div>
          </form>
        </div>

        {!forced ? (
          <p className="text-xs text-[var(--text-muted)]">
            Need a reset for another account? Use Setup → Users & RBAC (requires Users permission).
          </p>
        ) : null}
      </div>
    </AppShell>
  );
}
