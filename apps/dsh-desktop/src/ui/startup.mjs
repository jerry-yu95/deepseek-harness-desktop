const title = document.querySelector('#status-title')
const detail = document.querySelector('#status-detail')
const sequence = document.querySelector('#sequence')
const errorLog = document.querySelector('#error-log')
const actions = document.querySelector('#actions')
const version = document.querySelector('#version')

const copy = {
  stopped: ['运行时已停止', 'The local DSH host is stopped.', 'SEQUENCE / 00'],
  starting: ['正在启动完整 Harness', 'Loading the official runtime, plugins, skins, and skill catalog.', 'BOOT SEQUENCE / 02'],
  ready: ['本地界面已就绪', 'Handing control to the original DSH Web surface.', 'BOOT SEQUENCE / 03'],
  stopping: ['正在安全关闭', 'Waiting for sessions and background work to settle.', 'SHUTDOWN / 01'],
  restarting: ['正在恢复运行时', 'A bounded restart is in progress.', 'RECOVERY / AUTO'],
  crashed: ['本地运行时未能启动', 'Use Retry first. Repair rebuilds only the desktop profile links.', 'RECOVERY / MANUAL'],
}

function render(status) {
  const state = copy[status.state] ? status.state : 'crashed'
  const [heading, message, code] = copy[state]
  document.body.dataset.state = state
  title.textContent = heading
  detail.textContent = message
  sequence.textContent = code
  const failed = state === 'crashed'
  errorLog.hidden = !failed
  actions.hidden = !failed
  errorLog.textContent = failed ? (status.error || 'Unknown runtime error') : ''
}

for (const button of document.querySelectorAll('[data-action]')) {
  button.addEventListener('click', async () => {
    const buttons = [...document.querySelectorAll('[data-action]')]
    buttons.forEach((item) => { item.disabled = true })
    try {
      await window.dshDesktop.action(button.dataset.action)
    } catch (error) {
      render({ state: 'crashed', error: error.message })
    } finally {
      buttons.forEach((item) => { item.disabled = false })
    }
  })
}

const info = await window.dshDesktop.getInfo()
version.textContent = `DESKTOP ${info.version}`
render(await window.dshDesktop.getStatus())
window.dshDesktop.onStatus(render)
