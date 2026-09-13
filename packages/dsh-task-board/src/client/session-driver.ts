import type { SessionDriver } from '../core/execution.ts'

interface TerminalEvent { type: string; time: number; data: unknown }
interface DriverSources {
  session: Pick<SessionDriver, 'rename' | 'prompt'> & {
    getSnapshot(): { running: boolean; lastAgentError: string | null }
    subscribe(listener: () => void): () => void
  }
  list: { subscribe(listener: () => void): () => void }
  running(): boolean
  initialEvents(): readonly TerminalEvent[]
  follow(signal: AbortSignal): AsyncIterable<{ type: string; records?: readonly { event: TerminalEvent }[]; event?: TerminalEvent }>
}

/** Background tasks need their own bounded follow; the UI window is staged-only. */
export function createSessionDriver(sources: DriverSources): SessionDriver {
  const turnEnds = new Map<number, number>()
  let terminalError: string | null | undefined
  const observe = (event: TerminalEvent) => {
    if (event.type !== 'turn/end') return
    const data = event.data as { turn: number; reason: { kind: string } }
    turnEnds.set(data.turn, event.time)
    terminalError = data.reason.kind === 'error' ? 'agent turn failed' : null
  }
  for (const event of sources.initialEvents()) observe(event)
  return {
    rename: title => sources.session.rename(title),
    prompt: (content, mode) => sources.session.prompt(content, mode),
    getSnapshot: () => ({
      running: sources.running(),
      lastAgentError: terminalError !== undefined ? terminalError : sources.session.getSnapshot().lastAgentError,
      turnEnds,
    }),
    subscribe(listener) {
      const controller = new AbortController()
      const offSession = sources.session.subscribe(listener)
      const offList = sources.list.subscribe(listener)
      void (async () => {
        for await (const frame of sources.follow(controller.signal)) {
          if (controller.signal.aborted) break
          if (frame.type === 'snapshot') for (const entry of frame.records ?? []) observe(entry.event)
          else if (frame.type === 'event' && frame.event) observe(frame.event)
          listener()
        }
      })().catch(() => {
        // List-driven reconciliation still checks durable history if transport drops.
      })
      return () => { controller.abort(); offSession(); offList() }
    },
  }
}
