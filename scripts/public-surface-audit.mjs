import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { classifyPublicSurfacePath, PUBLIC_SURFACE_RULES, publicSurfacePath } from './public-surface-policy.mjs'

function* walk(root, current = root) {
  const entries = readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
  for (const entry of entries) {
    const path = join(current, entry.name)
    if (entry.isDirectory()) {
      const relativePath = publicSurfacePath(root, path)
      if (entry.name === 'node_modules' || entry.name === '.git'
        || relativePath === 'apps/dsh-desktop/dist' || relativePath === '.local-evidence') continue
      yield* walk(root, path)
    } else if (entry.isFile()) yield path
  }
}

export function auditRoot(root) {
  const findings = []
  for (const absolutePath of walk(root)) {
    const relativePath = publicSurfacePath(root, absolutePath)
    const classification = classifyPublicSurfacePath(relativePath)
    if (classification !== 'active-doc') continue

    let contents
    try {
      contents = readFileSync(absolutePath, 'utf8')
    } catch {
      continue
    }
    const lines = contents.split(/\r?\n/u)
    lines.forEach((line, index) => {
      for (const rule of PUBLIC_SURFACE_RULES) {
        if (!rule.pattern.test(line)) continue
        findings.push({
          path: relativePath,
          line: index + 1,
          rule: rule.id,
          message: rule.message,
        })
      }
    })
  }
  findings.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.rule.localeCompare(b.rule))
  return { ok: findings.length === 0, findings }
}

function formatFinding(finding) {
  return `${finding.path}:${finding.line} [${finding.rule}] ${finding.message}`
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const result = auditRoot(process.cwd())
  if (result.ok) {
    console.log('public surface audit passed')
  } else {
    console.error(`public surface audit found ${result.findings.length} issue(s)`)
    for (const finding of result.findings) console.error(formatFinding(finding))
    process.exitCode = 1
  }
}
