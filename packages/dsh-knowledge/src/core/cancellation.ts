/** Abort reasons are never reflected: they may contain upstream response data. */
export function assertActive(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('knowledge-cancelled')
}

export async function withDeadline<T>(signal: AbortSignal, timeoutMs: number, run: (signal: AbortSignal) => Promise<T>, timeoutCode = 'knowledge-model-timeout'): Promise<T> {
  assertActive(signal)
  const controller = new AbortController()
  let rejectAbort!: (error: Error) => void
  const interrupted = new Promise<never>((_resolve, reject) => { rejectAbort = reject })
  const cancel = () => { controller.abort(); rejectAbort(new Error('knowledge-cancelled')) }
  signal.addEventListener('abort', cancel, { once: true })
  const timer = setTimeout(() => {
    controller.abort()
    rejectAbort(new Error(timeoutCode))
  }, timeoutMs)
  try {
    return await Promise.race([run(controller.signal), interrupted])
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', cancel)
    controller.abort()
  }
}
