import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { version } = require('../package.json')

export const DESKTOP_METADATA = Object.freeze({
  appId: 'studio.harness.design.desktop',
  productName: 'JIWEI',
  version,
  profile: 'desktop',
  protocol: 'dsh',
})

export async function bootstrapDesktopApp() {
  const { startElectronApp } = await import('./electron-app.mjs')
  return startElectronApp(DESKTOP_METADATA)
}

if (process.versions.electron) {
  bootstrapDesktopApp().catch((error) => {
    console.error('desktop bootstrap failed', error)
    process.exitCode = 1
  })
}
