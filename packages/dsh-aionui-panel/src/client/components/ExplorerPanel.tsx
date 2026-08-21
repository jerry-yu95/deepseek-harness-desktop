/**
 * The Explorer column: Files/Changes tab bar (37px), the persistent filename
 * search at the top of the Files tab (150ms debounced; a hit click REVEALS
 * the file in the tree — expand ancestors + select — never opens preview),
 * the lazy file tree (34px rows, full-row expand/collapse, 16px icons), and
 * the in-column collapse chevron.
 *
 * AionUi Explorer behavior (Apache-2.0, re-implemented): row click toggles
 * folders (no need to hit the arrow), search results are reveal-only, and
 * clicking a file opens it in the preview panel (dedup focuses the tab).
 * @module dsh-aionui-panel/client/components/ExplorerPanel
 */

import { memo, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { JSX, KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { FsEntry } from '../../core/types.ts'
import { parentRel } from '../fileType.ts'
import { t } from '../locales.ts'
import { useStore } from '../hooks/useStore.ts'
import type { PanelStores } from '../store.ts'
import { FileTypeIcon } from './FileIcon.tsx'
import { ChevronRightIcon, CloseIcon, ExpandRightIcon, SearchIcon } from './icons.tsx'
import { ScmPanel } from './ScmPanel.tsx'
import { activateOnKey } from './a11y.ts'
import { copyWorkspaceReference, pasteWorkspaceEntry, rememberWorkspaceReference } from '../workspaceReference.ts'
import explorerCss from '../styles/explorer.module.css'
import '../styles/tokens.module.css'

declare global {
  interface Window {
    dshDesktop?: {
      revealPath(root: string, relativePath: string, isDirectory: boolean): Promise<unknown>
    }
  }
}

/** Row indent step per tree depth (px). */
const INDENT_STEP = 16

/**
 * The whole explorer column content.
 * @param stores - the panel store bundle.
 * @param onToggleCollapse - collapse the column (host chrome).
 */
export function ExplorerPanel({
  stores,
  onToggleCollapse,
}: {
  stores: PanelStores
  onToggleCollapse: () => void
}): JSX.Element {
  const state = useStore(stores.explorer)
  const [searchFocus, setSearchFocus] = useState(false)

  return (
    <div className="aionui-root" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* The Files/Changes tab bar. */}
      <div className={explorerCss.tabBar}>
        <button
          type="button"
          className={state.activeTab === 'files' ? explorerCss.tabBtnActive : explorerCss.tabBtn}
          onClick={() => stores.explorer.setActiveTab('files')}
        >
          {t('explorer.tabs.files')}
        </button>
        <button
          type="button"
          className={state.activeTab === 'changes' ? explorerCss.tabBtnActive : explorerCss.tabBtn}
          onClick={() => stores.explorer.setActiveTab('changes')}
        >
          {t('explorer.tabs.changes')}
        </button>
        <button
          type="button"
          className="aionui-collapse-chevron"
          style={{ marginLeft: 'auto' }}
          onClick={onToggleCollapse}
          title={t('explorer.collapse')}
          aria-label={t('explorer.collapse')}
        >
          <ExpandRightIcon size={16} />
        </button>
      </div>

      {/* Files tab: search + tree (kept mounted; hidden when changes is active). */}
      <div style={{ display: state.activeTab === 'files' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <SearchArea
          stores={stores}
          searchFocus={searchFocus}
          onFocusChange={setSearchFocus}
        />
        <FileTree stores={stores} />
      </div>

      {/* Changes tab: SCM (mounted on demand; its store outlives the tab). */}
      {state.activeTab === 'changes' && <ScmPanel stores={stores} />}
    </div>
  )
}

/** The search box + results (the tree stays mounted underneath). */
function SearchArea({
  stores,
  searchFocus,
  onFocusChange,
}: {
  stores: PanelStores
  searchFocus: boolean
  onFocusChange: (focused: boolean) => void
}): JSX.Element {
  const explorer = stores.explorer
  const state = useStore(explorer)
  const search = state.search
  const active = search.query !== ''
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: active ? 1 : undefined }}>
      <div className={explorerCss.searchArea}>
        <div
          className={`${explorerCss.searchBox}${searchFocus ? ` ${explorerCss.searchAreaFocus}` : ''}`}
          style={{ borderColor: searchFocus ? 'var(--aion-primary)' : undefined }}
        >
          <span className={explorerCss.searchIcon}><SearchIcon size={14} /></span>
          <input
            ref={inputRef}
            className={explorerCss.searchInput}
            value={search.query}
            placeholder={t('explorer.search.placeholder')}
            aria-label={t('explorer.search.placeholder')}
            onFocus={() => onFocusChange(true)}
            onBlur={() => onFocusChange(false)}
            onChange={(event) => explorer.setSearchQuery(event.target.value)}
          />
          {search.query !== '' && (
            <button
              type="button"
              className={explorerCss.searchClear}
              onClick={() => { explorer.cancelSearch(); inputRef.current?.focus() }}
              aria-label={t('common.close')}
            >
              <CloseIcon size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Result list replaces the tree while the query is active (the tree
          underneath stays mounted — subscriptions never thrash). */}
      {active ? (
        <SearchResults stores={stores} />
      ) : null}
    </div>
  )
}

/** The flat search-result stream (click = reveal in tree). */
function SearchResults({ stores }: { stores: PanelStores }): JSX.Element {
  const explorer = stores.explorer
  const state = useStore(explorer)
  const search = state.search
  return (
    <div className={explorerCss.scrollArea}>
      {search.status === 'searching' && search.hits.length === 0 && (
        <div className={explorerCss.searchStatus}>{t('explorer.search.searching')}</div>
      )}
      {search.status === 'error' && <div className={explorerCss.searchStatus}>{t('explorer.search.error')}</div>}
      {search.status === 'done' && search.hits.length === 0 && (
        <div className={explorerCss.searchStatus}>{t('explorer.search.empty')}</div>
      )}
      {search.hits.map((hit) => (
        <div
          key={hit.path}
          className={explorerCss.resultRow}
          role="button"
          tabIndex={0}
          title={hit.path}
          onClick={() => {
            // Reveal: expand the ancestor chain and select — not preview.
            explorer.reveal(hit.path)
          }}
          onKeyDown={activateOnKey(() => { explorer.reveal(hit.path) })}
        >
          <FileTypeIcon name={hit.name} isDir={hit.isDir} expanded={false} />
          <span className={explorerCss.resultName}>{hit.name}</span>
          <span className={explorerCss.resultPath}>{parentRel(hit.path)}</span>
        </div>
      ))}
      {search.truncated && search.hits.length > 0 && (
        <div className={explorerCss.searchStatus}>{t('explorer.search.truncated', { count: search.hits.length })}</div>
      )}
    </div>
  )
}

/** The lazy file tree. */
function FileTree({ stores }: { stores: PanelStores }): JSX.Element {
  const explorer = stores.explorer
  const preview = stores.preview
  const state = useStore(explorer)
  const root = state.root
  const [menu, setMenu] = useState<{ entry: FsEntry; x: number; y: number } | null>(null)

  if (root === '') return <div className={explorerCss.emptyState}>{t('explorer.tree.empty')}</div>
  const entries = state.dirs['']
  if (entries === undefined) {
    return <div className={explorerCss.searchStatus}>{t('scm.loading')}</div>
  }
  if (entries.length === 0) return <div className={explorerCss.emptyState}>{t('explorer.tree.empty')}</div>

  return (
    <div className={`${explorerCss.scrollArea} ${explorerCss.tree}`}>
      {entries.map((entry) => (
        <TreeRow
          key={entry.path}
          entry={entry}
          depth={0}
          expanded={state.expanded}
          selected={state.selected}
          dirs={state.dirs}
          root={state.root}
          stores={stores}
          onContextMenu={(entry, x, y) => setMenu({ entry, x, y })}
        />
      ))}
      {menu !== null && createPortal(
        <FileContextMenu stores={stores} root={root} {...menu} onClose={() => setMenu(null)} />,
        document.body,
      )}
    </div>
  )
}

/** One tree row (recursive for children). */
function TreeRowBase({
  entry,
  depth,
  expanded,
  selected,
  dirs,
  root,
  stores,
  onContextMenu,
}: {
  entry: FsEntry
  depth: number
  expanded: string[]
  selected: string | null
  dirs: Record<string, FsEntry[]>
  root: string
  stores: PanelStores
  onContextMenu: (entry: FsEntry, x: number, y: number) => void
}): JSX.Element {
  const explorer = stores.explorer
  const preview = stores.preview
  const isExpanded = expanded.includes(entry.path)
  const isSelected = selected === entry.path
  const children = entry.isDir ? dirs[entry.path] : undefined

  const handleClick = (): void => {
    if (entry.isDir) {
      // Full-row expand/collapse toggle.
      explorer.toggleDir(entry.path)
      return
    }
    // A file: select + open in preview (dedup focuses the open tab).
    explorer.select(entry.path)
    preview.openFile(root, entry.path)
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
      event.preventDefault()
      event.stopPropagation()
      copyText(copyWorkspaceReference(root, entry.path, entry.isDir))
      return
    }
    activateOnKey(handleClick)(event)
  }

  return (
    <>
      <div
        className={`${explorerCss.treeRow}${isSelected ? ` ${explorerCss.treeRowSelected}` : ''}`}
        style={{ paddingLeft: 12 + 8 + depth * INDENT_STEP }}
        onClick={handleClick}
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
          explorer.select(entry.path)
          onContextMenu(entry, event.clientX, event.clientY)
        }}
        onKeyDown={handleKeyDown}
        onDoubleClick={(event) => {
          // Double-click on a file: same as click (open). Folders: keep toggle.
          event.stopPropagation()
        }}
        role="button"
        tabIndex={0}
        aria-expanded={entry.isDir ? isExpanded : undefined}
        title={entry.path}
      >
        {entry.isDir ? (
          <span className={`${explorerCss.treeArrow}${isExpanded ? ` ${explorerCss.treeArrowOpen}` : ''}`}>
            <ChevronRightIcon size={13} />
          </span>
        ) : (
          <span className={explorerCss.treeArrowEmpty} />
        )}
        <FileTypeIcon name={entry.name} isDir={entry.isDir} expanded={isExpanded} />
        <span className={explorerCss.treeName}>{entry.name}</span>
      </div>
      {entry.isDir && isExpanded && children !== undefined && (
        <div>
          {children.map((child) => (
            <TreeRow
              key={child.path}
              entry={child}
              depth={depth + 1}
              expanded={expanded}
              selected={selected}
              dirs={dirs}
              root={root}
              stores={stores}
              onContextMenu={onContextMenu}
            />
          ))}
        </div>
      )}
    </>
  )
}

/**
 * A memoized tree row so the whole tree does not re-render on every explorer
 * state change (search keystrokes, tab switches, fs version bumps). The row
 * takes the `state` fields it actually reads as individual props — `expanded`,
 * `selected`, `dirs` — whose references only change when the corresponding
 * data changed, so the default shallow comparison skips rows whose own entry,
 * ancestor, expansion or selection are unaffected. A `dirs` re-fetch (an fs
 * event that relists the expanded dirs) still re-renders the rows under those
 * dirs — the unavoidable O(open-dirs) cost — but transient UI state no longer
 * invalidates the tree.
 */
const TreeRow = memo(TreeRowBase)

function copyText(value: string): void {
  void navigator.clipboard?.writeText(value).catch(() => {})
}

async function addToConversation(root: string, path: string, isDir: boolean): Promise<void> {
  if (await pasteWorkspaceEntry(root, path, isDir)) return
  const token = `@${rememberWorkspaceReference(path, isDir)} `
  copyText(token)
  window.alert(t('explorer.menu.addFallback'))
}

function childPath(entry: FsEntry, name: string): string {
  const base = entry.isDir ? entry.path : parentRel(entry.path)
  return base === '' ? name : `${base}/${name}`
}

function FileContextMenu({
  stores, root, entry, x, y, onClose,
}: {
  stores: PanelStores
  root: string
  entry: FsEntry
  x: number
  y: number
  onClose: () => void
}): JSX.Element {
  useEffect(() => {
    const close = (): void => onClose()
    const key = (event: KeyboardEvent): void => { if (event.key === 'Escape') close() }
    window.addEventListener('pointerdown', close)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', key)
    }
  }, [onClose])

  const mutate = async (operation: Promise<unknown>): Promise<void> => {
    await operation
    await stores.explorer.handleFsChange()
    onClose()
  }
  const askCreate = (directory: boolean): void => {
    const name = window.prompt(directory ? t('explorer.menu.folderName') : t('explorer.menu.fileName'))?.trim()
    if (!name || name.includes('/') || name.includes('\\')) return
    const path = childPath(entry, name)
    void mutate(directory ? stores.api.createDirectory(root, path) : stores.api.createFile(root, path))
  }
  const renameEntry = (): void => {
    const name = window.prompt(t('explorer.menu.renamePrompt'), entry.name)?.trim()
    if (!name || name === entry.name || name.includes('/') || name.includes('\\')) return
    void mutate(stores.api.rename(root, entry.path, childPath({ ...entry, isDir: false }, name)))
  }
  const removeEntry = (): void => {
    if (!window.confirm(t('explorer.menu.deleteConfirm', { name: entry.name }))) return
    void mutate(stores.api.delete(root, entry.path))
  }
  const style = { left: Math.min(x, window.innerWidth - 230), top: Math.min(y, window.innerHeight - 350) }
  const item = (label: string, action: () => void, danger = false): JSX.Element => (
    <button type="button" className={`${explorerCss.contextItem}${danger ? ` ${explorerCss.contextDanger}` : ''}`} onClick={action}>{label}</button>
  )
  return (
    <div className={explorerCss.contextMenu} style={style} role="menu" onPointerDown={(event) => event.stopPropagation()}>
      {item(t('explorer.menu.addConversation'), () => { void addToConversation(root, entry.path, entry.isDir); onClose() })}
      {window.dshDesktop !== undefined && item(t('explorer.menu.reveal'), () => { void window.dshDesktop?.revealPath(root, entry.path, entry.isDir); onClose() })}
      <div className={explorerCss.contextSeparator} />
      {item(t('explorer.menu.newFile'), () => askCreate(false))}
      {item(t('explorer.menu.newFolder'), () => askCreate(true))}
      <div className={explorerCss.contextSeparator} />
      {item(t('explorer.menu.copyPath'), () => { copyText(`${root}/${entry.path}`); onClose() })}
      {item(t('explorer.menu.copyRelativePath'), () => { copyText(entry.path); onClose() })}
      <div className={explorerCss.contextSeparator} />
      {item(t('explorer.menu.rename'), renameEntry)}
      {item(t('explorer.menu.delete'), removeEntry, true)}
    </div>
  )
}
