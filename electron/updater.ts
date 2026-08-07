import { app, dialog } from "electron";
import { autoUpdater } from "electron-updater";

/**
 * Checks GitHub Releases for a newer build (packaged app + internet only).
 * Free: uses https://github.com/syedsaadaliaskari/agrisoft-pro/releases
 */
export function setupAutoUpdater(): void {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("error", (err) => {
    console.warn("Auto-update error:", err?.message ?? err);
  });

  autoUpdater.on("update-available", (info) => {
    console.log("Update available:", info.version);
  });

  autoUpdater.on("update-downloaded", (info) => {
    void dialog
      .showMessageBox({
        type: "info",
        title: "Update ready",
        message: `Agri Soft Pro ${info.version} is ready to install.`,
        detail: "Restart now to apply the update. Your local data stays on this PC.",
        buttons: ["Restart now", "Later"],
        defaultId: 0,
        cancelId: 1,
      })
      .then((result) => {
        if (result.response === 0) {
          // Skip quit backup race — updater restarts the process
          autoUpdater.quitAndInstall(false, true);
        }
      });
  });

  // Let the window appear first, then check quietly
  setTimeout(() => {
    void autoUpdater.checkForUpdates().catch((err) => {
      console.warn("checkForUpdates failed:", err?.message ?? err);
    });
  }, 8000);
}
