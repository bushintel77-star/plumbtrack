import { app, shell, BrowserWindow, nativeTheme } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

function createWindow(): void {
  nativeTheme.themeSource = 'dark'
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1180,
    minHeight: 760,
    show: false,
    backgroundColor: '#0F1115',
    title: 'FieldLoop HQ — Dispatch Command Center',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

void app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
