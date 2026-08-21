export const WINDOW_CHROME_HEIGHT = 30

const WINDOW_CHROME_ID = 'dsh-desktop-window-chrome'

export const WINDOW_CHROME_CSS = `
:root {
  --dsh-desktop-window-chrome-height: ${WINDOW_CHROME_HEIGHT}px;
}

html[data-dsh-desktop-window-chrome="true"] body {
  box-sizing: border-box !important;
  height: 100vh !important;
  min-height: 0 !important;
  padding-top: var(--dsh-desktop-window-chrome-height) !important;
}

#${WINDOW_CHROME_ID} {
  -webkit-app-region: drag;
  position: fixed;
  z-index: 2147483647;
  top: 0;
  right: 0;
  left: 0;
  display: flex;
  height: var(--dsh-desktop-window-chrome-height);
  align-items: center;
  justify-content: space-between;
  padding: 0 154px 0 78px;
  overflow: hidden;
  color: #234255;
  border-bottom: 1px solid rgba(91, 160, 194, 0.18);
  background:
    radial-gradient(circle at 18% 0%, rgba(116, 201, 255, 0.22), transparent 32%),
    linear-gradient(105deg, rgba(238, 248, 255, 0.96), rgba(241, 244, 255, 0.94) 50%, rgba(232, 250, 247, 0.96));
  backdrop-filter: blur(18px) saturate(1.15);
  box-shadow:
    inset 0 1px rgba(255, 255, 255, 0.82),
    0 3px 12px rgba(45, 88, 119, 0.08);
  font-family: "Bahnschrift", "Aptos Display", sans-serif;
  user-select: none;
}

#${WINDOW_CHROME_ID}::after {
  position: absolute;
  right: 154px;
  bottom: 0;
  left: 48px;
  height: 1px;
  content: "";
  opacity: 0.48;
  background: linear-gradient(90deg, rgba(71, 167, 219, 0.5), rgba(125, 108, 226, 0.18) 42%, transparent 78%);
}

#${WINDOW_CHROME_ID} .dsh-window-chrome-brand,
#${WINDOW_CHROME_ID} .dsh-window-chrome-context {
  display: flex;
  min-width: 0;
  align-items: center;
}

#${WINDOW_CHROME_ID} .dsh-window-chrome-brand {
  gap: 10px;
}

#${WINDOW_CHROME_ID} .dsh-window-chrome-mark {
  position: relative;
  width: 14px;
  height: 14px;
  flex: none;
  border: 1px solid rgba(53, 141, 187, 0.36);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.54);
  box-shadow: inset 0 0 0 3px rgba(72, 164, 214, 0.06);
}

#${WINDOW_CHROME_ID} .dsh-window-chrome-mark::before,
#${WINDOW_CHROME_ID} .dsh-window-chrome-mark::after {
  position: absolute;
  content: "";
  border-radius: 50%;
}

#${WINDOW_CHROME_ID} .dsh-window-chrome-mark::before {
  inset: 3px;
  border: 1px solid rgba(53, 141, 187, 0.44);
}

#${WINDOW_CHROME_ID} .dsh-window-chrome-mark::after {
  top: 6px;
  left: 6px;
  width: 2px;
  height: 2px;
  background: #287ea9;
}

#${WINDOW_CHROME_ID} .dsh-window-chrome-title {
  overflow: hidden;
  color: #24475a;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.11em;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

#${WINDOW_CHROME_ID} .dsh-window-chrome-divider {
  width: 28px;
  height: 1px;
  margin: 0 10px;
  background: linear-gradient(90deg, rgba(53, 141, 187, 0.42), rgba(91, 114, 201, 0.08));
}

#${WINDOW_CHROME_ID} .dsh-window-chrome-context {
  color: rgba(54, 92, 117, 0.62);
  font-size: 9px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  white-space: nowrap;
}

#${WINDOW_CHROME_ID} .dsh-window-chrome-mode {
  color: rgba(54, 92, 117, 0.4);
  font-size: 8px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  white-space: nowrap;
}

@media (max-width: 760px) {
  #${WINDOW_CHROME_ID} .dsh-window-chrome-divider,
  #${WINDOW_CHROME_ID} .dsh-window-chrome-context,
  #${WINDOW_CHROME_ID} .dsh-window-chrome-mode {
    display: none;
  }
}

@media (prefers-contrast: more) {
  #${WINDOW_CHROME_ID} {
    border-bottom-color: rgba(190, 238, 250, 0.5);
    background: #eef7fc;
  }
}
`

export function windowChromeBrowserOptions() {
  return {
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#eef7fc',
      symbolColor: '#24475a',
      height: WINDOW_CHROME_HEIGHT,
    },
  }
}

export function createWindowChromeScript({ title, context }) {
  const data = JSON.stringify({
    context: String(context || 'Desktop'),
    id: WINDOW_CHROME_ID,
    title: String(title || 'DeepSeek Harness'),
  })
  return `(() => {
    const data = ${data};
    document.getElementById(data.id)?.remove();
    const chrome = document.createElement('div');
    chrome.id = data.id;
    chrome.setAttribute('aria-hidden', 'true');
    chrome.innerHTML = '<div class="dsh-window-chrome-brand"><span class="dsh-window-chrome-mark"></span><span class="dsh-window-chrome-title"></span><span class="dsh-window-chrome-divider"></span><span class="dsh-window-chrome-context"></span></div><span class="dsh-window-chrome-mode">LOCAL SURFACE</span>';
    chrome.querySelector('.dsh-window-chrome-title').textContent = data.title;
    chrome.querySelector('.dsh-window-chrome-context').textContent = data.context;
    document.documentElement.dataset.dshDesktopWindowChrome = 'true';
    document.body.prepend(chrome);
    return true;
  })()`
}

export async function applyWindowChrome({ webContents, title, context }) {
  if (!webContents || webContents.isDestroyed?.()) return false
  await webContents.insertCSS(WINDOW_CHROME_CSS, { cssOrigin: 'author' })
  return webContents.executeJavaScript(createWindowChromeScript({ title, context }), true)
}

export function installWindowChrome({ browserWindow, title, getContext, onError = () => {} }) {
  const { webContents } = browserWindow
  const apply = () => {
    const url = webContents.getURL()
    const context = getContext?.(url) || 'Desktop'
    void applyWindowChrome({ webContents, title, context }).catch(onError)
  }
  webContents.on('did-finish-load', apply)
  return () => webContents.removeListener('did-finish-load', apply)
}
