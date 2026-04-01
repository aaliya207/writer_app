const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');

// ─── Config ───────────────────────────────────────────────────────────────────
const FLASK_PORT = 5000;
const FLASK_URL  = `http://127.0.0.1:${FLASK_PORT}`;
const POLL_INTERVAL_MS = 300;   // how often to ping Flask
const FLASK_TIMEOUT_MS = 30000; // give up after 30 s

let mainWindow  = null;
let flaskProcess = null;

function getPackagedFlaskPath() {
  const candidates = [
    path.join(process.resourcesPath, 'app', 'app.exe'),
    path.join(path.dirname(process.execPath), 'resources', 'app', 'app.exe'),
    path.join(path.dirname(process.execPath), 'app', 'app.exe'),
  ];

  return candidates.find(candidate => fs.existsSync(candidate)) || candidates[0];
}

// ─── Flask launcher ───────────────────────────────────────────────────────────
function startFlask() {
  const isProd = app.isPackaged;

  let flaskCmd, flaskArgs, flaskCwd;

  if (isProd) {
    // ✅ PRODUCTION (after build)
    flaskCmd = getPackagedFlaskPath();
    flaskArgs = [];
    flaskCwd = path.dirname(flaskCmd);
  } else {
    // ✅ DEV — run app.py with Python directly
    flaskCmd = 'python';
    flaskArgs = ['app.py'];
    flaskCwd = path.join(__dirname, '..');
  }

  console.log('[Scripvia] Starting Flask:', flaskCmd);

  if (isProd && !fs.existsSync(flaskCmd)) {
    throw new Error(`Packaged Flask executable not found: ${flaskCmd}`);
  }

  flaskProcess = spawn(flaskCmd, flaskArgs, {
    cwd: flaskCwd,
    windowsHide: true,
    env: { 
      ...process.env,
      FLASK_ENV: 'development',
      ENV_FILE: path.join(__dirname, '..', '.env')
    },
  });

  flaskProcess.on('error', (err) => {
    console.error('[Scripvia] Flask process failed to start:', err.message);
    flaskProcess = null;
  });

  flaskProcess.on('exit', (code, signal) => {
    console.log('[Scripvia] Flask process exited', { code, signal });
    flaskProcess = null;
  });

  if (flaskProcess.stdout) {
    flaskProcess.stdout.on('data', d => console.log('[Flask]', d.toString()));
  }
  if (flaskProcess.stderr) {
    flaskProcess.stderr.on('data', d => console.error('[Flask]', d.toString()));
  }
}

// ─── Poll until Flask is ready ────────────────────────────────────────────────
function waitForFlask() {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    function ping() {
      http.get(FLASK_URL, (res) => {
        res.resume(); // drain response
        resolve();    // Flask is up!
      }).on('error', () => {
        if (Date.now() - start > FLASK_TIMEOUT_MS) {
          reject(new Error('Flask did not start within timeout'));
        } else {
          setTimeout(ping, POLL_INTERVAL_MS);
        }
      });
    }

    ping();
  });
}

// ─── Create the browser window ────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width:           1280,
    height:          800,
    minWidth:        900,
    minHeight:       600,
    title:           'Scripvia',
    icon:            path.join(__dirname, 'assets', 'scripvia.ico'),
    show:            false, // don't flash until ready
    backgroundColor: '#0f1021',
    webPreferences: {
      nodeIntegration:     false,
      contextIsolation:    true,
      // No preload needed — Scripvia is a full-page Flask app
    },
  });

  // Hide the default menu bar (feels more app-like)
  mainWindow.setMenuBarVisibility(false);

  // Load the loading screen HTML immediately (no server needed)
  mainWindow.loadFile(path.join(__dirname, 'loading.html'));

  // Show window as soon as the loading screen has painted
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Open external links in the system browser, not inside the app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  createWindow();

  try {
    startFlask();
    await waitForFlask();
    console.log('[Scripvia] Flask ready — navigating to app');

    if (mainWindow) {
      // Fade out the loading screen, then navigate
      await mainWindow.webContents.executeJavaScript(`
        document.body.style.transition = 'opacity 0.35s ease';
        document.body.style.opacity = '0';
        new Promise(r => setTimeout(r, 380));
      `);
      mainWindow.loadURL(FLASK_URL);
    }
  } catch (err) {
    console.error('[Scripvia] Flask never became ready:', err.message);
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript(`
        document.getElementById('status').textContent = 'Failed to start — please restart the app';
        document.getElementById('status').style.color = '#f87171';
      `);
    }
  }
});

// Kill Flask when ALL windows are closed
app.on('window-all-closed', () => {
  killFlask();
  // On macOS apps stay in dock until explicitly quit — for a writing tool, just quit
  app.quit();
});

app.on('before-quit', () => {
  killFlask();
});

function killFlask() {
  const child = flaskProcess;
  if (!child || !child.pid) {
    return;
  }

  console.log('[Scripvia] Killing Flask process', child.pid);

  try {
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/pid', `${child.pid}`, '/f', '/t'], {
        windowsHide: true,
      });
      killer.on('error', (e) => console.error('[Scripvia] Error running taskkill:', e.message));
    } else {
      child.kill('SIGTERM');
    }
  } catch (e) {
    console.error('[Scripvia] Error killing Flask:', e);
  } finally {
    flaskProcess = null;
  }
}
