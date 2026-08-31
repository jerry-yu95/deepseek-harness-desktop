import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useEffect } from 'react'

let activeSessionId: string | undefined

export function getActiveSessionId(): string | undefined {
  return activeSessionId
}

type SessionTrackerProps = PropsRuntime<'conversation.input.left'>

/** Observe the official conversation slot without rendering another control. */
export function SessionTracker({ sessionId }: SessionTrackerProps) {
  useEffect(() => {
    activeSessionId = sessionId
    return () => { if (activeSessionId === sessionId) activeSessionId = undefined }
  }, [sessionId])
  return null
}
