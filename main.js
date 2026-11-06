/**
 * Агуулах Desktop — Electron main process
 * Өгөгдөл: %APPDATA%\agulah\agulah\data.json  (шинэчлэл хийхэд хөндөгдөхгүй)
 * Шинэчлэл: GitHub Releases (mrheakup/agulah) — electron-updater
 */

const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs   = require('fs');
const http = require('http');
const url  = require('url');

// ── Нэг л цонх ажиллана ─────────────────────────────────
if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

// ── Өгөгдлийн хадгалах зам ──────────────────────────────
// Тогтмол зам: portable v1.3 болон суулгагч хувилбар нэг өгөгдлийг хуваалцана
const DATA_DIR  = path.join(app.getPath('appData'), 'agulah', 'agulah');
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const PORT      = 3737;

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function readDB() {
  if (!fs.existsSync(DATA_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch (e) { return {}; }
}

function writeDB(data) {
  if (fs.existsSync(DATA_FILE)) {
    try { fs.copyFileSync(DATA_FILE, DATA_FILE.replace('.json', '.bak.json')); } catch (e) {}
  }
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}

// ── Дотоод HTTP сервер (agulah.html-д /api/data хангана) ─
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.css':  'text/css',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

const server = http.createServer((req, res) => {
  const pathname = url.parse(req.url, true).pathname;

  if (req.method === 'GET' && pathname === '/api/data') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(readDB()));
    return;
  }

  if (req.method === 'POST' && pathname === '/api/data') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        writeDB(JSON.parse(body));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end('{"ok":false}');
      }
    });
    return;
  }

  const filePath = pathname === '/' ? '/agulah.html' : pathname;
  const safePath = path.join(__dirname, path.normalize(filePath).replace(/^(\.\.[\/\\])+/, ''));
  fs.readFile(safePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(safePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
});

// ── Цонх ────────────────────────────────────────────────
let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 900, minHeight: 600,
    title: 'Агуулах — КЭЙ ЭЙЧ ИНТЕРНЭШНЬЛ ХХК',
    icon: path.join(__dirname, 'build', 'icon.png'),
    show: false,
    backgroundColor: '#f8f6f1',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.setWindowOpenHandler(({ url: u }) => {
    if (u.startsWith('http://localhost') || u === 'about:blank') return { action: 'allow' };
    shell.openExternal(u);
    return { action: 'deny' };
  });

  win.once('ready-to-show', () => win.show());
  win.webContents.on('did-finish-load', () => sendUpd({}));
  win.loadURL(`http://localhost:${PORT}/agulah.html`);

  win.webContents.on('before-input-event', (_, input) => {
    if (input.key === 'F12') win.webContents.toggleDevTools();
    if (input.key === 'F5')  win.webContents.reload();
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Програм', submenu: [
      { label: 'Шинэчлэл шалгах', click: () => checkUpdates(true) },
      { label: 'Өгөгдлийн хавтас нээх', click: () => shell.openPath(DATA_DIR) },
      { type: 'separator' },
      { label: `Хувилбар ${app.getVersion()}`, enabled: false },
      { type: 'separator' },
      { role: 'quit', label: 'Гарах' },
    ]},
    { label: 'Харагдац', submenu: [
      { role: 'reload', label: 'Дахин ачаалах' },
      { role: 'zoomIn', label: 'Томруулах' },
      { role: 'zoomOut', label: 'Жижигрүүлэх' },
      { role: 'resetZoom', label: 'Анхны хэмжээ' },
      { role: 'togglefullscreen', label: 'Бүтэн дэлгэц' },
    ]},
  ]));
}

// ── Автомат шинэчлэл (GitHub Releases) ──────────────────
let updState = { state: 'idle', current: app.getVersion() };
let manualCheck = false;
function sendUpd(s) {
  updState = { ...updState, ...s };
  if (win && !win.isDestroyed()) win.webContents.send('upd', updState);
}

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.on('checking-for-update', () => sendUpd({ state: 'checking' }));
autoUpdater.on('update-available',  i => sendUpd({ state: 'downloading', version: i.version, percent: 0 }));
autoUpdater.on('update-not-available', () => {
  sendUpd({ state: 'latest' });
  if (manualCheck && win) dialog.showMessageBox(win, { message: `Хамгийн сүүлийн хувилбар (${app.getVersion()}) суусан байна.` });
  manualCheck = false;
});
autoUpdater.on('download-progress', p => sendUpd({ state: 'downloading', percent: Math.round(p.percent) }));
autoUpdater.on('update-downloaded', i => sendUpd({ state: 'ready', version: i.version }));
autoUpdater.on('error', e => {
  sendUpd({ state: 'error', message: String((e && e.message) || e).slice(0, 200) });
  if (manualCheck && win) dialog.showMessageBox(win, { type: 'warning', message: 'Шинэчлэл шалгаж чадсангүй. Интернэт холболтоо шалгана уу.' });
  manualCheck = false;
});

function checkUpdates(manual) {
  manualCheck = !!manual;
  if (!app.isPackaged) { sendUpd({ state: 'dev' }); return; }
  autoUpdater.checkForUpdates().catch(e => sendUpd({ state: 'error', message: String(e.message || e).slice(0, 200) }));
}

// ── IPC ─────────────────────────────────────────────────
ipcMain.handle('get-data-path',    () => DATA_FILE);
ipcMain.handle('open-data-folder', () => shell.openPath(DATA_DIR));
ipcMain.handle('get-version',      () => app.getVersion());
ipcMain.handle('check-update',     () => { checkUpdates(true); return true; });
ipcMain.handle('install-update',   () => { setImmediate(() => autoUpdater.quitAndInstall(false, true)); return true; });

// ── Lifecycle ───────────────────────────────────────────
server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    dialog.showErrorBox('Порт ашиглагдаж байна', `${PORT} порт өөр програмд ашиглагдаж байна.\nКомпьютерээ дахин асаагаад оролдоно уу.`);
    app.quit();
  }
});

app.whenReady().then(() => {
  server.listen(PORT, '127.0.0.1', () => {
    createWindow();
    setTimeout(() => checkUpdates(false), 4000);
    setInterval(() => checkUpdates(false), 4 * 3600 * 1000);
  });
});

app.on('window-all-closed', () => { server.close(); app.quit(); });
