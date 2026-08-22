/**
 * The desktop IPC bridge surface the extension center consumes.
 *
 * The desktop app injects `window.dshDesktop` (contextBridge preload) into
 * every window it hosts, including the one carrying the official web GUI —
 * so this plugin, running inside the GUI, reaches the skill/connector IPC
 * handlers directly. In a plain browser session the bridge is absent and the
 * panel degrades to a desktop-only notice (see getDesktopBridge).
 */

/** One discovered skill (from the extension inventory). */
export interface SkillSummary {
  id: string
  name: string
  description: string
  source: string
  shadowed?: boolean
}

/** The extension inventory slice this plugin renders. */
export interface ExtensionInventory {
  skills: SkillSummary[]
}

/** One registered connector (registry record; secrets never leave the host). */
export interface ConnectorRecord {
  id: string
  name: string
  description?: string
  kind: 'mcp' | 'http'
  transport: 'stdio' | 'streamable-http' | 'http'
  enabled?: boolean
  url?: string
  command?: string
  args?: string[]
  capabilities?: string[]
  secretEnvKeys?: string[]
}

/** Skill Studio create payload (host-side validation is authoritative). */
export interface SkillCreateInput {
  name: string
  description: string
  instructions: string
  examples?: string
}

/** Connector save payload (host-side validation is authoritative). */
export interface ConnectorSaveInput {
  id: string
  name: string
  description?: string
  kind: 'mcp' | 'http'
  transport?: 'stdio' | 'streamable-http' | 'http'
  url?: string
  command?: string
  args?: string[]
  capabilities?: string[]
  secretEnvKeys?: string[]
  enabled?: boolean
}

/** Connector health-check outcome. */
export interface ConnectorCheckResult {
  ok: boolean
  detail: string
}

/** The typed window.dshDesktop slice this plugin depends on. */
export interface DesktopBridge {
  listExtensions(): Promise<ExtensionInventory>
  importSkill(): Promise<{ canceled: boolean; skill?: { name: string } }>
  createSkill(input: SkillCreateInput): Promise<{ name: string }>
  openSkill(id: string): Promise<unknown>
  openSkillRoot(): Promise<unknown>
  listConnectors(): Promise<ConnectorRecord[]>
  saveConnector(input: ConnectorSaveInput): Promise<ConnectorRecord>
  removeConnector(id: string): Promise<unknown>
  checkConnector(id: string): Promise<ConnectorCheckResult>
}

/** Every bridge method the plugin calls; presence-checked as a set. */
const REQUIRED_METHODS: ReadonlyArray<keyof DesktopBridge> = [
  'listExtensions',
  'importSkill',
  'createSkill',
  'openSkill',
  'openSkillRoot',
  'listConnectors',
  'saveConnector',
  'removeConnector',
  'checkConnector',
]

/**
 * Resolve the desktop bridge, or undefined when absent (plain browser) or
 * incomplete (older desktop build). Never throws.
 */
export function getDesktopBridge(): DesktopBridge | undefined {
  if (typeof window === 'undefined') return undefined
  const candidate: unknown = (window as { dshDesktop?: unknown }).dshDesktop
  if (candidate === null || typeof candidate !== 'object') return undefined
  const bridge = candidate as Record<string, unknown>
  return REQUIRED_METHODS.every((method) => typeof bridge[method] === 'function')
    ? (candidate as DesktopBridge)
    : undefined
}

/** Split a textarea value into trimmed, non-empty lines. */
export function splitLines(value: unknown): string[] {
  return String(value ?? '')
    .split(/\r?\n/u)
    .map((item) => item.trim())
    .filter(Boolean)
}

/** Split a comma-separated input into trimmed, non-empty items. */
export function splitComma(value: unknown): string[] {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

/** Skill Studio form values (raw strings from the form). */
export interface SkillFormValues {
  name: string
  description: string
  instructions: string
  examples?: string
}

/** Map raw form values to the create-skill payload. */
export function buildSkillInput(values: SkillFormValues): SkillCreateInput {
  const examples = values.examples?.trim()
  return {
    name: values.name.trim(),
    description: values.description.trim(),
    instructions: values.instructions.trim(),
    ...(examples ? { examples } : {}),
  }
}

/** Connector form values (raw strings from the form). */
export interface ConnectorFormValues {
  id: string
  name: string
  description?: string
  kind: 'mcp' | 'http'
  transport: 'stdio' | 'streamable-http'
  url?: string
  command?: string
  args?: string
  capabilities?: string
  secretEnvKeys?: string
}

/**
 * Map raw form values to the save-connector payload, mirroring the host-side
 * shape rules: HTTP connectors carry transport "http" plus a URL; MCP stdio
 * connectors carry a command and its argument list; MCP streamable-http
 * connectors carry a URL.
 */
export function buildConnectorInput(values: ConnectorFormValues): ConnectorSaveInput {
  const description = values.description?.trim() ?? ''
  const capabilities = splitComma(values.capabilities)
  const secretEnvKeys = splitComma(values.secretEnvKeys)
  const base = {
    id: values.id.trim(),
    name: values.name.trim(),
    description,
    capabilities,
    secretEnvKeys,
    enabled: true,
  }
  if (values.kind === 'http') {
    return { ...base, kind: 'http', transport: 'http', url: (values.url ?? '').trim() }
  }
  if (values.transport === 'stdio') {
    return {
      ...base,
      kind: 'mcp',
      transport: 'stdio',
      command: (values.command ?? '').trim(),
      args: splitLines(values.args),
    }
  }
  return { ...base, kind: 'mcp', transport: 'streamable-http', url: (values.url ?? '').trim() }
}

/** Endpoint text for a connector card: stdio command line or the URL. */
export function connectorEndpoint(
  connector: Pick<ConnectorRecord, 'kind' | 'transport' | 'command' | 'args' | 'url'>,
): string {
  if (connector.kind === 'mcp' && connector.transport === 'stdio') {
    return [connector.command ?? '', ...(connector.args ?? [])].filter(Boolean).join(' ')
  }
  return connector.url ?? ''
}
