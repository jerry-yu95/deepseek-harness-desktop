const pluginList = document.querySelector('#plugin-list')
const skillList = document.querySelector('#skill-list')
const pluginCount = document.querySelector('#plugin-count')
const skillCount = document.querySelector('#skill-count')
const toast = document.querySelector('#toast')
const currentVersion = document.querySelector('#current-version')
const latestVersion = document.querySelector('#latest-version')
const sourceVersion = document.querySelector('#source-version')
const sourceCommit = document.querySelector('#source-commit')
const updateSummary = document.querySelector('#update-summary')
const runtimeSource = document.querySelector('#runtime-source')
const checkedAt = document.querySelector('#checked-at')
const installUpdate = document.querySelector('#install-update')
const rollbackUpdate = document.querySelector('#rollback-update')
const stageSourceUpdate = document.querySelector('#stage-source-update')
const appCurrentVersion = document.querySelector('#app-current-version')
const appLatestVersion = document.querySelector('#app-latest-version')
const appUpdatePhase = document.querySelector('#app-update-phase')
const appUpdateProgress = document.querySelector('#app-update-progress')

function renderAppUpdate(status) {
  appCurrentVersion.textContent = status.currentVersion
  appLatestVersion.textContent = status.availableVersion ?? (status.phase === 'current' ? status.currentVersion : '尚未检查')
  const labels = {
    idle: '等待检查', checking: '正在检查', available: '发现新版', current: '已是最新',
    downloading: '正在下载', downloaded: '等待安装', installing: '正在安装',
    unavailable: '仅正式版可用', error: '检查失败',
  }
  appUpdatePhase.textContent = labels[status.phase] ?? status.phase
  appUpdateProgress.textContent = status.phase === 'downloading'
    ? `${Math.round(status.progress?.percent ?? 0)}%`
    : (status.error ?? (status.supported ? 'GitHub Releases' : '开发模式'))
}

function escapeHtml(value) {
  const element = document.createElement('span')
  element.textContent = String(value)
  return element.innerHTML
}

function notify(message, error = false) {
  toast.textContent = message
  toast.classList.toggle('error', error)
  toast.hidden = false
  clearTimeout(notify.timer)
  notify.timer = setTimeout(() => { toast.hidden = true }, 4_000)
}

function pluginMarkup(plugin) {
  const badge = plugin.builtIn ? '<span class="badge builtin">BUILT-IN</span>' : '<span class="badge">COMMUNITY</span>'
  const requested = plugin.builtIn ? 'Desktop bundle / managed' : plugin.requested
  const action = plugin.builtIn
    ? '<span class="meta">PROTECTED</span>'
    : `<button type="button" class="item-action danger" data-remove-plugin="${escapeHtml(plugin.name)}">移除</button>`
  return `<article class="item"><div><div class="name-row"><span class="name">${escapeHtml(plugin.name)}</span>${badge}</div><p class="description">${escapeHtml(requested)}</p></div>${action}</article>`
}

function skillMarkup(skill) {
  const shadow = skill.shadowed ? '<span class="badge shadowed">SHADOWED</span>' : ''
  return `<article class="item"><div><div class="name-row"><span class="name">${escapeHtml(skill.name)}</span>${shadow}</div><p class="description">${escapeHtml(skill.description)}</p></div><button type="button" class="item-action" data-open-skill="${escapeHtml(skill.id)}">${escapeHtml(skill.source)}</button></article>`
}

function renderUpdate(status) {
  currentVersion.textContent = status.currentVersion
  runtimeSource.textContent = status.source === 'packaged' ? '随安装包提供' : '独立更新'
  latestVersion.textContent = status.checkedVersion ?? '尚未检查'
  checkedAt.textContent = status.checkedAt ? `npm 检查于 ${new Date(status.checkedAt).toLocaleString()}` : '连接官方注册表后显示'
  sourceVersion.textContent = status.sourceVersion ?? '尚未检查'
  sourceCommit.textContent = status.sourceCheckError
    ? `GitHub 检查失败：${status.sourceCheckError}`
    : status.sourceCommit
    ? `commit ${status.sourceCommit.slice(0, 12)}${status.sourceVersionAhead ? ' · 源码领先当前内核' : ''}`
    : (status.sourceCheckedAt ? '已检查版本，commit 暂不可用' : '连接 GitHub 后显示')
  if (status.sourceSnapshot?.commit) {
    sourceCommit.textContent = `${sourceCommit.textContent} · 已同步 ${status.sourceSnapshot.commit.slice(0, 12)}`
  }
  const summary = []
  if (status.latestPublishedAt) {
    summary.push(`npm ${status.checkedVersion} 发布于 ${new Date(status.latestPublishedAt).toLocaleString()}`)
  }
  if (status.latestDescription) summary.push(status.latestDescription)
  if (status.sourceCommitMessage) {
    const date = status.sourceCommitDate ? `（${new Date(status.sourceCommitDate).toLocaleString()}）` : ''
    summary.push(`GitHub 最新提交：${status.sourceCommitMessage}${date}`)
  }
  updateSummary.textContent = summary.join(' · ')
  updateSummary.hidden = summary.length === 0
  stageSourceUpdate.hidden = !status.sourceCommit
  stageSourceUpdate.dataset.commit = status.sourceCommit ?? ''
  installUpdate.hidden = !status.updateAvailable
  installUpdate.dataset.version = status.checkedVersion ?? ''
  rollbackUpdate.hidden = !status.previousVersion
  rollbackUpdate.textContent = status.previousVersion ? `回退到 ${status.previousVersion}` : '回退上一版'
}

async function refresh() {
  document.body.dataset.busy = 'true'
  try {
    const [inventory, updateStatus, appUpdateStatus] = await Promise.all([
      window.dshDesktop.listExtensions(),
      window.dshDesktop.getUpdateStatus(),
      window.dshDesktop.getAppUpdateStatus(),
    ])
    pluginCount.textContent = inventory.plugins.length
    skillCount.textContent = inventory.skills.length
    pluginList.innerHTML = inventory.plugins.length ? inventory.plugins.map(pluginMarkup).join('') : '<p class="empty">暂无插件</p>'
    skillList.innerHTML = inventory.skills.length ? inventory.skills.map(skillMarkup).join('') : '<p class="empty">尚未发现技能</p>'
    renderUpdate(updateStatus)
    renderAppUpdate(appUpdateStatus)
  } catch (error) {
    notify(error.message, true)
  } finally {
    delete document.body.dataset.busy
  }
}

function selectTab(tab) {
  for (const item of document.querySelectorAll('[data-tab]')) item.classList.toggle('active', item === tab)
  for (const panel of document.querySelectorAll('.panel')) {
    const active = panel.id === tab.dataset.tab
    panel.hidden = !active
    panel.classList.toggle('active', active)
  }
}

for (const tab of document.querySelectorAll('[data-tab]')) {
  tab.addEventListener('click', () => selectTab(tab))
}

const initialTab = location.hash.slice(1)
if (initialTab) {
  const tab = document.querySelector(`[data-tab="${initialTab}"]`)
  if (tab) selectTab(tab)
}

document.querySelector('#plugin-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const spec = new FormData(event.currentTarget).get('spec')
  const button = event.currentTarget.querySelector('button')
  button.disabled = true
  try {
    const result = await window.dshDesktop.installPlugin(spec)
    notify(`${result.name} 已安装，DSH 已重启`)
    event.currentTarget.reset()
    await refresh()
  } catch (error) {
    notify(error.message, true)
  } finally {
    button.disabled = false
  }
})

pluginList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-remove-plugin]')
  if (!button) return
  button.disabled = true
  try {
    await window.dshDesktop.removePlugin(button.dataset.removePlugin)
    notify(`${button.dataset.removePlugin} 已移除`)
    await refresh()
  } catch (error) {
    notify(error.message, true)
    button.disabled = false
  }
})

skillList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-open-skill]')
  if (button) await window.dshDesktop.openSkill(button.dataset.openSkill)
})

document.querySelector('#import-skill').addEventListener('click', async () => {
  try {
    const result = await window.dshDesktop.importSkill()
    if (!result.canceled) {
      notify(`${result.skill.name} 已导入`)
      await refresh()
    }
  } catch (error) {
    notify(error.message, true)
  }
})
document.querySelector('#open-skill-root').addEventListener('click', () => window.dshDesktop.openSkillRoot())
document.querySelector('#refresh').addEventListener('click', refresh)
document.querySelector('#check-update').addEventListener('click', async (event) => {
  event.currentTarget.disabled = true
  try {
    const result = await window.dshDesktop.checkAndInstallUpdate()
    renderUpdate(result.status)
    if (result.action === 'installed') notify(`官方内核已更新到 ${result.status.currentVersion}`)
    else if (result.action === 'current') notify('当前已是最新版本')
  } catch (error) {
    notify(`更新失败：${error.message}`, true)
  } finally {
    event.currentTarget.disabled = false
  }
})
document.querySelector('#check-app-update').addEventListener('click', async (event) => {
  event.currentTarget.disabled = true
  try {
    const result = await window.dshDesktop.checkAppUpdates()
    renderAppUpdate(result.status)
    if (result.action === 'current') notify('桌面应用已是最新版本')
    else if (result.action === 'downloaded') notify('应用更新已下载，将在稍后安装')
  } catch (error) {
    notify(`应用更新失败：${error.message}`, true)
  } finally {
    event.currentTarget.disabled = false
  }
})
stageSourceUpdate.addEventListener('click', async () => {
  stageSourceUpdate.disabled = true
  try {
    const status = await window.dshDesktop.stageSourceUpdate(stageSourceUpdate.dataset.commit)
    renderUpdate(status)
    notify(`GitHub 源码已同步到隔离快照（${status.sourceSnapshot?.version ?? status.sourceVersion}）`)
  } catch (error) {
    notify(`源码同步失败：${error.message}`, true)
  } finally {
    stageSourceUpdate.disabled = false
  }
})
installUpdate.addEventListener('click', async () => {
  installUpdate.disabled = true
  try {
    const status = await window.dshDesktop.installUpdate(installUpdate.dataset.version)
    renderUpdate(status)
    notify(`官方内核已更新到 ${status.currentVersion}`)
  } catch (error) {
    notify(`更新失败，已尝试恢复上一版：${error.message}`, true)
  } finally {
    installUpdate.disabled = false
  }
})
rollbackUpdate.addEventListener('click', async () => {
  rollbackUpdate.disabled = true
  try {
    const status = await window.dshDesktop.rollbackUpdate()
    renderUpdate(status)
    notify(`已回退到 ${status.currentVersion}`)
  } catch (error) {
    notify(error.message, true)
  } finally {
    rollbackUpdate.disabled = false
  }
})
window.dshDesktop.onUpdateStatus(renderUpdate)
window.dshDesktop.onAppUpdateStatus(renderAppUpdate)

await refresh()
