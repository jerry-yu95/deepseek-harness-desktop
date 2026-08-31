import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(resolve(root, 'apps/dsh-desktop/package.json'))
const sharp = require('sharp')
const brandDir = resolve(root, 'docs/brand')
const buildDir = resolve(root, 'apps/dsh-desktop/build')
const markSource = resolve(brandDir, 'jiwei-mark.svg')
const bannerSource = resolve(brandDir, 'jiwei-banner.svg')

await mkdir(brandDir, { recursive: true })
await mkdir(buildDir, { recursive: true })

const mark = await readFile(markSource)
const banner = await readFile(bannerSource)
const icon1024 = await sharp(mark).resize(1024, 1024).png().toBuffer()
const icon256 = await sharp(mark).resize(256, 256).png().toBuffer()

await writeFile(resolve(brandDir, 'jiwei-mark.png'), icon1024)
await writeFile(resolve(brandDir, 'jiwei-banner.png'), await sharp(banner).resize(1600, 600).png().toBuffer())
await writeFile(resolve(brandDir, 'app-icon.png'), icon1024)
await writeFile(resolve(buildDir, 'icon.png'), icon1024)
await writeFile(resolve(buildDir, 'icon-source-v3.png'), icon1024)

const header = Buffer.alloc(22)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(1, 4)
header.writeUInt8(0, 6)
header.writeUInt8(0, 7)
header.writeUInt8(0, 8)
header.writeUInt8(0, 9)
header.writeUInt16LE(1, 10)
header.writeUInt16LE(32, 12)
header.writeUInt32LE(icon256.length, 14)
header.writeUInt32LE(22, 18)
await writeFile(resolve(buildDir, 'icon.ico'), Buffer.concat([header, icon256]))

console.log('generated original JIWEI banner and application icons')
