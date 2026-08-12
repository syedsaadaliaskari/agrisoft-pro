import type { LanMode } from "../../shared/lan";
import { loadLanConfig } from "./config";
import { invokeLanRpc } from "./client";

/** Thin bridge so ipc/register does not import the full LAN stack circularly. */
export function getLanMode(): LanMode {
  return loadLanConfig().mode;
}

export async function invokeLanClient(channel: string, args: unknown[]): Promise<unknown> {
  return invokeLanRpc(channel, args);
}
