import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("aspPrint", {
  print: () => ipcRenderer.invoke("print-preview:print"),
  close: () => ipcRenderer.invoke("print-preview:close"),
});
