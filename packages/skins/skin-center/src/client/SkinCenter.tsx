import { useEffect, useRef, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'
import { analyseImage, type AdaptivePalette } from './palette.ts'
import { applyAdaptiveTheme, clearAdaptiveTheme, DEFAULT_WALLPAPER_VISIBILITY, normalizeWallpaperVisibility } from './runtime-theme.ts'
import css from './skin-center.module.css'

export interface SkinCenterInjected {
  theme: {
    getTheme(): ThemeSnapshot
    subscribe(listener: () => void): () => void
    setTheme(id: 'light' | 'dark'): void
  }
}

export type SkinCenterComponentProps = PropsRuntime<'web-ui.plugin.item'> & PropsLocale<'skinCenter'> & SkinCenterInjected

interface ThemeState {
  enabled: boolean
  palette?: AdaptivePalette
  imageUrl?: string
  updatedAt?: string
  visibility?: number
}

const API = '/api/adaptive-theme'
const MAX_FILE_BYTES = 15 * 1024 * 1024
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('file-read-failed'))
    reader.onload = () => {
      const value = String(reader.result ?? '')
      const comma = value.indexOf(',')
      if (comma < 0) reject(new Error('file-read-failed'))
      else resolve(value.slice(comma + 1))
    }
    reader.readAsDataURL(file)
  })
}

export function SkinCenter({ t, theme }: SkinCenterComponentProps) {
  const input = useRef<HTMLInputElement>(null)
  const previewUrl = useRef<string | null>(null)
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<ThemeState>({ enabled: false })
  const [candidate, setCandidate] = useState<{ file: File; palette: AdaptivePalette; url: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [visibility, setVisibility] = useState(DEFAULT_WALLPAPER_VISIBILITY)
  const [visibilityDirty, setVisibilityDirty] = useState(false)

  useEffect(() => {
    void fetch(`${API}/state`).then(async response => {
      const payload = await response.json() as ThemeState & { ok?: boolean }
      if (response.ok && payload.ok === true) {
        setState(payload)
        setVisibility(normalizeWallpaperVisibility(payload.visibility))
      }
    }).catch(() => {})
    return () => {
      if (previewUrl.current !== null) URL.revokeObjectURL(previewUrl.current)
    }
  }, [])

  const choose = async (file: File): Promise<void> => {
    setError(null)
    if (!ACCEPTED_TYPES.has(file.type)) return setError(t('invalidType'))
    if (file.size > MAX_FILE_BYTES) return setError(t('tooLarge'))
    try {
      const palette = await analyseImage(file)
      const url = URL.createObjectURL(file)
      if (previewUrl.current !== null) URL.revokeObjectURL(previewUrl.current)
      previewUrl.current = url
      setCandidate({ file, palette, url })
      theme.setTheme(palette.mode)
      applyAdaptiveTheme(url, palette, visibility)
    } catch {
      setError(t('decodeFailed'))
    }
  }

  const apply = async (): Promise<void> => {
    if (candidate === null && (!state.enabled || !visibilityDirty)) return
    setBusy(true)
    setError(null)
    try {
      const response = candidate === null
        ? await fetch(`${API}/visibility`, {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ visibility }),
          })
        : await fetch(`${API}/apply`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ mime: candidate.file.type, data: await fileToBase64(candidate.file), palette: candidate.palette, visibility }),
          })
      const payload = await response.json().catch(() => null) as (ThemeState & { ok?: boolean; error?: string }) | null
      if (!response.ok || payload?.ok !== true) throw new Error(payload?.error ?? `HTTP ${response.status}`)
      setState(payload)
      const palette = payload.palette ?? candidate?.palette
      const imageUrl = payload.imageUrl ?? candidate?.url
      if (palette !== undefined && imageUrl !== undefined) applyAdaptiveTheme(imageUrl, palette, visibility)
      setCandidate(null)
      setVisibilityDirty(false)
    } catch (cause) {
      setError(`${t('applyFailed')}: ${cause instanceof Error ? cause.message : String(cause)}`)
    } finally {
      setBusy(false)
    }
  }

  const restore = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`${API}/restore`, { method: 'POST' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      clearAdaptiveTheme()
      setCandidate(null)
      setState({ enabled: false })
      setVisibility(DEFAULT_WALLPAPER_VISIBILITY)
      setVisibilityDirty(false)
    } catch (cause) {
      setError(`${t('restoreFailed')}: ${cause instanceof Error ? cause.message : String(cause)}`)
    } finally {
      setBusy(false)
    }
  }

  const visiblePalette = candidate?.palette ?? state.palette
  const visibleImage = candidate?.url ?? state.imageUrl

  return (
    <li className={css.pluginCard}>
      <button type="button" className={css.cardHeader} aria-expanded={open} onClick={() => setOpen(value => !value)}>
        <span className={css.headText}>
          <span className={css.pluginName}>{t('title')}<span className={css.titleBadge}>AUTO</span></span>
          <span className={css.cardDescription}>{t('cardDescription')}</span>
        </span>
        <span className={open ? css.chevronOpen : css.chevron}>▾</span>
      </button>
      {open && (
        <div className={css.cardBody}>
          <p className={css.intro}>{t('intro')}</p>
          <input ref={input} className={css.hiddenInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={event => {
            const file = event.currentTarget.files?.[0]
            if (file !== undefined) void choose(file)
            event.currentTarget.value = ''
          }} />
          <button type="button" className={css.dropZone} onClick={() => input.current?.click()}>
            {visibleImage !== undefined
              ? <img className={css.preview} src={visibleImage} alt="" />
              : <span className={css.emptyPreview}>＋<strong>{t('choose')}</strong><small>{t('formatHint')}</small></span>}
          </button>
          {visiblePalette !== undefined && (
            <div className={css.palette}>
              <span>{t('generatedPalette')}</span>
              {[visiblePalette.accent, visiblePalette.surface, visiblePalette.text, visiblePalette.muted].map(color => (
                <i key={color} style={{ backgroundColor: color }} title={color} />
              ))}
              <b>{visiblePalette.mode === 'dark' ? t('themeDark') : t('themeLight')}</b>
            </div>
          )}
          {visibleImage !== undefined && visiblePalette !== undefined && (
            <label className={css.visibilityControl}>
              <span>{t('visibility')}</span>
              <input type="range" min="35" max="100" step="1" value={visibility} onChange={event => {
                const next = normalizeWallpaperVisibility(Number(event.currentTarget.value))
                setVisibility(next)
                setVisibilityDirty(true)
                applyAdaptiveTheme(visibleImage, visiblePalette, next)
              }} />
              <b>{visibility}%</b>
            </label>
          )}
          {candidate !== null && <p className={css.previewNotice}>{t('previewNotice')}</p>}
          {error !== null && <p className={css.error}>{error}</p>}
          <div className={css.actions}>
            <button type="button" className={css.buttonPrimary} disabled={(candidate === null && !visibilityDirty) || busy} onClick={() => void apply()}>{busy ? t('saving') : t('apply')}</button>
            <button type="button" className={css.button} disabled={busy || (!state.enabled && candidate === null)} onClick={() => void restore()}>{t('restore')}</button>
          </div>
          <p className={css.privacy}>{t('privacy')}</p>
        </div>
      )}
    </li>
  )
}
