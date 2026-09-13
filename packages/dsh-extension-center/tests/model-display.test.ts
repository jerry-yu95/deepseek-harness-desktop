import { afterEach, describe, expect, it, vi } from 'vitest'
import { installModelDisplay, disposeModelDisplay } from '../../dsh-web-ui-compat/src/client/model-display.ts'

afterEach(() => { disposeModelDisplay(); document.body.innerHTML = ''; vi.useRealTimers() })
function fixture(reveal = vi.fn().mockResolvedValue({ value: 'synthetic-saved-key' })) {
  const bridge = { getModelProviderDefault: vi.fn().mockResolvedValue({ baseURL: 'https://example.com/v1' }), revealSavedModelKey: reveal }
  Object.assign(window, { dshDesktop: bridge })
  document.body.innerHTML = '<div class="models_editor"><span class="models_editorRoute">fixture</span><div><input type="password" aria-label="API 密钥"></div><input aria-label="API 地址"><button>应用</button></div>'
  installModelDisplay()
  return { bridge, input: document.querySelector<HTMLInputElement>('input[aria-label="API 密钥"]')!, eye: document.querySelector<HTMLButtonElement>('[aria-label="显示 API 密钥"]')! }
}
describe('model configuration display', () => {
  it('does not mistake a new custom provider example URL for a working default', () => {
    const { input } = fixture()
    disposeModelDisplay()
    const id = document.createElement('input')
    id.setAttribute('aria-label', 'ID'); id.value = 'custom'
    input.closest('.models_editor')!.prepend(id)
    document.querySelector<HTMLInputElement>('[aria-label="API 地址"]')!.placeholder = 'https://gateway.example/v1'
    installModelDisplay()
    expect(document.body.textContent).not.toContain('留空使用默认地址')
    expect(document.body.textContent).toContain('请在高级设置中填写')
  })
  it('shows inherited endpoint and reveals a saved key separately without changing the form draft', async () => {
    const { bridge, input, eye } = fixture()
    await vi.waitFor(() => expect(document.body.textContent).toContain('https://example.com/v1'))
    expect(bridge.revealSavedModelKey).not.toHaveBeenCalled()
    eye.click()
    await vi.waitFor(() => expect(document.querySelector<HTMLInputElement>('[aria-label="临时显示的已保存密钥"]')?.value).toBe('synthetic-saved-key'))
    expect(input.value).toBe('')
    window.dispatchEvent(new Event('blur'))
    expect(document.querySelector<HTMLInputElement>('[aria-label="临时显示的已保存密钥"]')?.value).toBe('')
    expect(eye.getAttribute('aria-pressed')).toBe('false')
  })
  it('toggles draft visibility without fetching saved credentials and hides after 30 seconds', () => {
    vi.useFakeTimers()
    const { bridge, input, eye } = fixture()
    input.value = 'synthetic-draft'; eye.click()
    expect(input.type).toBe('text')
    expect(bridge.revealSavedModelKey).not.toHaveBeenCalled()
    vi.advanceTimersByTime(30_000)
    expect(input.type).toBe('password')
    expect(input.value).toBe('synthetic-draft')
  })
  it('discards a late secret response after blur or route changes', async () => {
    let resolve!: (result: { value: string }) => void
    const reveal = vi.fn(() => new Promise<{ value: string }>(done => { resolve = done }))
    const { eye } = fixture(reveal)
    eye.click(); window.dispatchEvent(new Event('blur'))
    resolve({ value: 'synthetic-late' })
    await Promise.resolve(); await Promise.resolve()
    expect(document.querySelector<HTMLInputElement>('[aria-label="临时显示的已保存密钥"]')?.value).toBe('')
    document.querySelector('.models_editorRoute')!.textContent = 'other'
    installModelDisplay()
    expect(document.querySelectorAll('[data-jiwei-model-display]')).toHaveLength(1)
  })
})
