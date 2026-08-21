import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const artifactPattern = /\.(?:dmg|exe|zip)$/u

export async function writeReleaseChecksums(directoryPath, outputName = 'SHA256SUMS.txt') {
  const directory = resolve(directoryPath)
  const outputPath = resolve(directory, outputName)
  const names = (await readdir(directory)).filter(name => artifactPattern.test(name)).sort()
  if (names.length === 0) throw new Error(`no release payloads found in ${directory}`)

  const lines = []
  for (const name of names) {
    const contents = await readFile(resolve(directory, name))
    lines.push(`${createHash('sha256').update(contents).digest('hex')}  ${name}`)
  }
  await writeFile(outputPath, `${lines.join('\n')}\n`, 'ascii')
  return { count: names.length, outputPath }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await writeReleaseChecksums(process.argv[2] || '.', process.argv[3])
  process.stdout.write(`wrote ${result.count} checksums to ${result.outputPath}\n`)
}
