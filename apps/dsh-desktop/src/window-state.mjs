import { readFile, writeFile } from 'node:fs/promises'

const MIN_WIDTH = 900
const MIN_HEIGHT = 640
const DEFAULT_WIDTH = 1280
const DEFAULT_HEIGHT = 820

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value))
}

function intersectionArea(left, right) {
  const width = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x))
  const height = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y))
  return width * height
}

export function normalizeWindowState(input = {}, displays = []) {
  if (displays.length === 0) {
    return { x: 0, y: 0, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, maximized: false }
  }
  const requested = {
    x: Number.isFinite(input.x) ? Math.round(input.x) : undefined,
    y: Number.isFinite(input.y) ? Math.round(input.y) : undefined,
    width: Number.isFinite(input.width) ? Math.round(input.width) : DEFAULT_WIDTH,
    height: Number.isFinite(input.height) ? Math.round(input.height) : DEFAULT_HEIGHT,
  }
  const requestedRect = {
    x: requested.x ?? displays[0].workArea.x,
    y: requested.y ?? displays[0].workArea.y,
    width: Math.max(1, requested.width),
    height: Math.max(1, requested.height),
  }
  const display = displays.find((candidate) => intersectionArea(requestedRect, candidate.bounds) >= 10_000)
  const workArea = (display ?? displays[0]).workArea
  const width = clamp(requested.width, Math.min(MIN_WIDTH, workArea.width), workArea.width)
  const height = clamp(requested.height, Math.min(MIN_HEIGHT, workArea.height), workArea.height)
  const x = display
    ? clamp(requestedRect.x, workArea.x, workArea.x + workArea.width - width)
    : Math.round(workArea.x + (workArea.width - width) / 2)
  const y = display
    ? clamp(requestedRect.y, workArea.y, workArea.y + workArea.height - height)
    : Math.round(workArea.y + (workArea.height - height) / 2)
  return { x, y, width, height, maximized: input.maximized === true }
}

export async function loadWindowState(path, displays) {
  try {
    return normalizeWindowState(JSON.parse(await readFile(path, 'utf8')), displays)
  } catch {
    return normalizeWindowState({}, displays)
  }
}

export function attachWindowStatePersistence(window, path) {
  let timer
  const save = async () => {
    const bounds = window.getNormalBounds()
    await writeFile(path, `${JSON.stringify({ ...bounds, maximized: window.isMaximized() }, null, 2)}\n`)
  }
  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(() => void save(), 250)
  }
  window.on('resize', schedule)
  window.on('move', schedule)
  window.on('maximize', schedule)
  window.on('unmaximize', schedule)
  window.on('closed', () => clearTimeout(timer))
  return save
}
