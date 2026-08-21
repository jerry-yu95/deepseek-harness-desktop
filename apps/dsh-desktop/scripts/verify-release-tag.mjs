import { readFile } from 'node:fs/promises'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const actualTag = process.argv[2] ?? process.env.GITHUB_REF_NAME
const expectedTag = `desktop-v${packageJson.version}`
if (actualTag !== expectedTag) {
  throw new Error(`release tag ${actualTag || '(missing)'} must match desktop version ${expectedTag}`)
}
process.stdout.write(`verified release tag ${actualTag}\n`)
