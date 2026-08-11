"use client";

import { useCallback, useEffect, useState } from "react";
import { getApi } from "@/lib/api";
import type { LicenseStatus } from "@shared/ipc";

/** Shared license check for login / home / lock gate. */
export function useLicenseStatus() {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const res = await getApi().getLicenseStatus();
    if (!res.ok) {
      setError(res.error);
      setStatus(null);
      setReady(true);
      return null;
    }
    setError("");
    setStatus(res.data);
    setReady(true);
    return res.data;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, ready, error, refresh };
}
