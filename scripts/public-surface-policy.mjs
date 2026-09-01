import { basename, extname, normalize, relative } from 'node:path'

const ACTIVE_ROOT_DOCS = new Set([
  'README.md',
  'README.en.md',
  'NOTICE.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
])

function normalized(value) {
  return normalize(value).replaceAll('\\', '/')
}

export function classifyPublicSurfacePath(relativePath) {
  const path = normalized(relativePath)
  const name = basename(path)
  const extension = extname(name).toLowerCase()

  if (path.startsWith('docs/plans/') || path.startsWith('docs/qa/') || path === 'docs/publish-prep.md') return 'historical'
  if (name === 'LICENSE' || name.startsWith('LICENSE.') || name === 'NOTICE.md') return 'legal'
  if (name === 'package.json' || name === 'pnpm-lock.yaml' || name.endsWith('.patch.yml')) return 'metadata'
  if (ACTIVE_ROOT_DOCS.has(path)) return 'active-doc'
  if ((path.startsWith('packages/') || path === 'scripts/plugin-template/README.md') && extension === '.md') return 'active-doc'
  if (path.startsWith('docs/') && extension === '.md') return 'active-doc'
  return 'ignore'
}

export const PUBLIC_SURFACE_RULES = [
  {
    id: 'legacy-installation',
    pattern: /(?:git\s+clone[^\n]*dsh-web-ui|github\.com\/zhu1090093659\/dsh-web-ui|github:<org>\/dsh-web-ui)/iu,
    message: 'legacy public installation instruction or inherited product reference',
  },
  {
    id: 'credential',
    pattern: /\b(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{20,})\b|\b(?:token|cookie|api[_-]?key|authorization)\s*[:=]\s*["']?(?!<|\$|\{|[A-Z_]+\b)[A-Za-z0-9._-]{20,}/iu,
    message: 'credential-shaped value in active public material',
  },
  {
    id: 'personal-path',
    pattern: /(?:\/Users\/[^\s`)'"/]+(?:\/|$)|\/home\/[^\s`)'"/]+(?:\/|$)|[A-Z]:\\Users\\[^\s`)'"\\]+\\)/iu,
    message: 'personal absolute path in active public material',
  },
]

export function publicSurfacePath(root, absolutePath) {
  return normalized(relative(root, absolutePath))
}
