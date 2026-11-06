/**
 * Preload — renderer процесст аюулгүйгээр API нээх
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  getDataPath:    () => ipcRenderer.invoke('get-data-path'),
  openDataFolder: () => ipcRenderer.invoke('open-data-folder'),
  getVersion:     () => ipcRenderer.invoke('get-version'),
  checkUpdate:    () => ipcRenderer.invoke('check-update'),
  installUpdate:  () => ipcRenderer.invoke('install-update'),
  onUpdate:       cb => ipcRenderer.on('upd', (e, s) => cb(s)),
});
