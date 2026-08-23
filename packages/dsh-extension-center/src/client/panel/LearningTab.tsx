import { tt } from '../helpers.ts'
import css from './panel.module.css'

const COMMUNITY_CAPABILITIES = [
  ['连接器中心', '自动发现 WorkBuddy、CodeBuddy、TRAE、Qoder 配置，也能直接导入服务方给出的 MCP JSON。'],
  ['Skill Studio', '把一套做事方法写成可复用的 SKILL.md；它是操作手册，不是拥有宿主权限的插件。'],
  ['增强编排', '标准、自适应、增强三档只调整执行策略；官方 Agent 循环、工具和权限边界仍是底座。'],
  ['可观测性', '查看缓存命中、模型健康、Token 消耗和 Agent 轨迹，发现问题后由人决定是否切换。'],
  ['移动与渠道', '手机远程继续同一会话；IM 机器人属于外部消息渠道，两者共享 Harness，但不是同一功能。'],
  ['桌面交付', '安全更新、失败回退、图片粘贴、自定义背景和跨平台安装都留在社区桌面层。'],
] as const

export function LearningTab() {
  return <div className={`${css.tabBody} ${css.learningBody}`}>
    <section className={css.learningHero}>
      <div>
        <p className={css.learningEyebrow}>{tt('learning.eyebrow')}</p>
        <h3>{tt('learning.title')}</h3>
        <p>{tt('learning.intro')}</p>
      </div>
      <a className={css.primaryButton} href="https://dsh-foundry-interactive.yufrank71.chatgpt.site" target="_blank" rel="noreferrer">{tt('learning.open')}</a>
    </section>

    <section className={css.learningRule}>
      <strong>{tt('learning.rule.title')}</strong>
      <span>{tt('learning.rule.body')}</span>
    </section>

    <section>
      <h3 className={css.sectionTitle}>{tt('learning.start.title')}</h3>
      <div className={css.learningSteps}>
        <article><span>1</span><div><strong>{tt('learning.start.workspace')}</strong><p>{tt('learning.start.workspace.body')}</p></div></article>
        <article><span>2</span><div><strong>{tt('learning.start.mode')}</strong><p>{tt('learning.start.mode.body')}</p></div></article>
        <article><span>3</span><div><strong>{tt('learning.start.permission')}</strong><p>{tt('learning.start.permission.body')}</p></div></article>
        <article><span>4</span><div><strong>{tt('learning.start.request')}</strong><p>{tt('learning.start.request.body')}</p></div></article>
      </div>
    </section>

    <section>
      <h3 className={css.sectionTitle}>{tt('learning.additions.title')}</h3>
      <p className={css.formHint}>{tt('learning.additions.hint')}</p>
      <div className={css.learningGrid}>
        {COMMUNITY_CAPABILITIES.map(([name, description]) => <article key={name}><strong>{name}</strong><p>{description}</p></article>)}
      </div>
    </section>
  </div>
}
