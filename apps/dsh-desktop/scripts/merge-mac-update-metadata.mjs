import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import YAML from 'yaml'

export function mergeMacUpdateMetadata(documents) {
  if (!Array.isArray(documents) || documents.length < 2) {
    throw new Error('at least two macOS update metadata documents are required')
  }
  const parsed = documents.map(document => YAML.parse(document))
  const versions = new Set(parsed.map(item => item?.version))
  if (versions.size !== 1 || versions.has(undefined)) {
    throw new Error(`macOS update metadata versions do not match: ${[...versions].join(', ')}`)
  }

  const files = new Map()
  for (const item of parsed) {
    for (const file of item.files ?? []) {
      if (!file?.url || !file?.sha512) throw new Error('macOS update file is missing url or sha512')
      const existing = files.get(file.url)
      if (existing && existing.sha512 !== file.sha512) {
        throw new Error(`conflicting checksums for ${file.url}`)
      }
      files.set(file.url, file)
    }
  }

  const orderedFiles = [...files.values()].sort((left, right) => left.url.localeCompare(right.url))
  const fallback = orderedFiles.find(file => file.url.endsWith('.zip') && !file.url.includes('arm64'))
    ?? orderedFiles.find(file => file.url.endsWith('.zip'))
  if (!fallback) throw new Error('macOS update metadata must contain a ZIP payload')

  const releaseDates = parsed.map(item => item.releaseDate).filter(Boolean).sort()
  return YAML.stringify({
    version: parsed[0].version,
    files: orderedFiles,
    path: fallback.url,
    sha512: fallback.sha512,
    releaseDate: releaseDates.at(-1),
  })
}

async function main() {
  const [arm64Path, x64Path, outputPath = 'latest-mac.yml'] = process.argv.slice(2)
  if (!arm64Path || !x64Path) {
    throw new Error('usage: merge-mac-update-metadata.mjs <arm64.yml> <x64.yml> [output.yml]')
  }
  const documents = await Promise.all([arm64Path, x64Path].map(path => readFile(path, 'utf8')))
  await writeFile(outputPath, mergeMacUpdateMetadata(documents), 'utf8')
  process.stdout.write(`merged macOS update metadata into ${outputPath}\n`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
