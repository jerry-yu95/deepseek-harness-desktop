import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { ArticleBlocks } from '../src/client/panel/KnowledgeArticleReader.tsx'

afterEach(cleanup)

it('renders a video placeholder with only a safe article link and no player', () => {
  const { container } = render(<ArticleBlocks text={'前文\n\n[视频内容未解析]\n\n后文'} sourceUrl="https://example.com/article" />)
  expect(container.querySelector('video,iframe')).toBeNull()
  expect(screen.getByRole('link', { name: '前往原文观看' }).getAttribute('href')).toBe('https://example.com/article')
  expect([...container.children].map(node => node.tagName)).toEqual(['P', 'FIGURE', 'P'])
})

it('renders adjacent headings, ordered and unordered points with safe emphasis', () => {
  render(<ArticleBlocks text={'## 关键结论\n先验证再建设。\n- **第一点**：明确问题\n- 第二点：小步试验\n\n### 行动顺序\n1. 观察\n2. 验证'} />)
  expect(screen.getByRole('heading', { name: '关键结论' }).tagName).toBe('H2')
  expect(screen.getAllByRole('listitem')).toHaveLength(4)
  expect(screen.getByText('第一点').tagName).toBe('STRONG')
  expect(screen.getAllByRole('list').map(node => node.tagName)).toEqual(['UL', 'OL'])
})

it('renders source markup as inert text without creating remote images or active links', () => {
  const { container } = render(<ArticleBlocks text={'<script>synthetic()</script>\n\n![image](https://example.com/a.png)\n\n[unsafe](javascript:synthetic())'} />)
  expect(container.querySelector('script,img,a')).toBeNull()
  expect(container.textContent).toContain('<script>synthetic()</script>')
})
