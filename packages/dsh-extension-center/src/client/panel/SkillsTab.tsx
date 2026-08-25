/**
 * The Skills tab: the discovered-skill catalog, Skill Studio (create form),
 * bundle import, and the user skill root shortcut. Ports the dock's skill
 * surface; every mutation goes through the desktop bridge.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { buildSkillInput, type DesktopBridge, type SkillSummary } from '../bridge.ts'
import { errorMessage, tt } from '../helpers.ts'
import type { PanelToast } from './ExtensionPanel.tsx'
import css from './panel.module.css'

/** Props for the Skills tab. */
export interface SkillsTabProps {
  bridge: DesktopBridge
  refreshKey: number
  notify: (message: string, error?: boolean) => void
}

/** The Skills tab component. */
export function SkillsTab({ bridge, refreshKey, notify }: SkillsTabProps) {
  const [skills, setSkills] = useState<SkillSummary[] | null>(null)
  const [studioOpen, setStudioOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    try {
      const inventory = await bridge.listExtensions()
      setSkills(inventory.skills)
    } catch (error) {
      notify(errorMessage(error), true)
    }
  }, [bridge, notify])

  useEffect(() => { void load() }, [load, refreshKey])

  const onImport = async (): Promise<void> => {
    setBusy(true)
    try {
      const result = await bridge.importSkill()
      if (!result.canceled && result.skill !== undefined) {
        notify(tt('skills.imported', { name: result.skill.name }))
        await load()
      }
    } catch (error) {
      notify(errorMessage(error), true)
    } finally {
      setBusy(false)
    }
  }

  const onCreate = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const form = event.currentTarget
    const values = Object.fromEntries(new FormData(form))
    setBusy(true)
    try {
      const skill = await bridge.createSkill(buildSkillInput({
        name: String(values.name ?? ''),
        description: String(values.description ?? ''),
        instructions: String(values.instructions ?? ''),
        examples: String(values.examples ?? ''),
      }))
      notify(tt('skills.created', { name: skill.name }))
      form.reset()
      setStudioOpen(false)
      await load()
    } catch (error) {
      notify(errorMessage(error), true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={css.tabBody}>
      <div className={css.toolbar}>
        <button type="button" className={css.primaryButton} disabled={busy} onClick={() => { setStudioOpen((open) => !open) }}>
          {tt('skills.create')}
        </button>
        <button type="button" className={css.secondaryButton} disabled={busy} onClick={() => { void onImport() }}>
          {tt('skills.import')}
        </button>
        <button type="button" className={css.secondaryButton} disabled={busy} onClick={() => { void bridge.openSkillRoot() }}>
          {tt('skills.openRoot')}
        </button>
      </div>

      {studioOpen && (
        <form className={css.studioForm} onSubmit={(event) => { void onCreate(event) }}>
          <p className={css.studioSummary}>{tt('skills.studio.summary')}</p>
          <div className={css.formGrid}>
            <label>
              {tt('skills.form.name')}
              <input name="name" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder={tt('skills.form.name.placeholder')} />
            </label>
            <label>
              {tt('skills.form.description')}
              <input name="description" required placeholder={tt('skills.form.description.placeholder')} />
            </label>
          </div>
          <label>
            {tt('skills.form.instructions')}
            <textarea name="instructions" rows={8} required placeholder={tt('skills.form.instructions.placeholder')} />
          </label>
          <label>
            {tt('skills.form.examples')}
            <textarea name="examples" rows={4} placeholder={tt('skills.form.examples.placeholder')} />
          </label>
          <div className={css.formFooter}>
            <span>{tt('skills.form.hint')}</span>
            <button type="submit" disabled={busy}>{tt('skills.form.submit')}</button>
          </div>
        </form>
      )}

      {skills === null ? (
        <p className={css.empty}>{tt('common.loading')}</p>
      ) : skills.length === 0 ? (
        <p className={css.empty}>{tt('skills.empty')}</p>
      ) : (
        <div className={css.list} aria-live="polite">
          {skills.map((skill) => (
            <article key={skill.id} className={css.item}>
              <div className={css.itemBody}>
                <div className={css.nameRow}>
                  <span className={css.name}>{skill.name}</span>
                  {skill.shadowed === true && <span className={css.badge}>{tt('skills.badge.shadowed')}</span>}
                  {skill.managed !== undefined && <span className={css.badge} data-success="true">{tt('skills.badge.managed')}</span>}
                </div>
                <p className={css.description}>{skill.description}</p>
                {skill.managed?.version !== undefined && <p className={css.providerLine}>{tt('skills.managedVersion', { version: skill.managed.version })}</p>}
              </div>
              <button type="button" className={css.secondaryButton} onClick={() => { void bridge.openSkill(skill.id) }}>
                {skill.source}
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
