import { describe, expect, it, vi } from 'vitest'
import { PanelController } from '../src/client/panel/controller.ts'

describe('PanelController external-store callbacks', () => {
  it('remain bound when React invokes them as standalone callbacks', () => {
    const controller = new PanelController()
    const getSnapshot = controller.getSnapshot
    const subscribe = controller.subscribe
    const listener = vi.fn()

    const unsubscribe = subscribe(listener)
    expect(getSnapshot()).toEqual({ panelOpen: false, tab: 'skills' })

    controller.open('connectors')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(getSnapshot()).toEqual({ panelOpen: true, tab: 'connectors' })

    controller.open('learning')
    expect(listener).toHaveBeenCalledTimes(2)
    expect(getSnapshot()).toEqual({ panelOpen: true, tab: 'learning' })

    unsubscribe()
    controller.close()
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
