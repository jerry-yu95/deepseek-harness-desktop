export type SkinCenterKey = 'title' | 'cardDescription' | 'intro' | 'choose' | 'formatHint' | 'generatedPalette' | 'themeLight' | 'themeDark' | 'visibility' | 'previewNotice' | 'apply' | 'saving' | 'restore' | 'privacy' | 'invalidType' | 'tooLarge' | 'decodeFailed' | 'applyFailed' | 'restoreFailed'

export const zh: Record<SkinCenterKey, string> = {
  title: '自定义皮肤', cardDescription: '上传一张图片，自动生成可读、协调的界面主题。',
  intro: '保留官方布局，只根据图片自动适配背景、明暗模式、强调色与安全对比度。',
  choose: '选择皮肤图片', formatHint: 'PNG / JPEG / WebP，最大 15 MB，建议横图', generatedPalette: '自动配色',
  themeLight: '亮色', themeDark: '暗色', visibility: '壁纸可见度', previewNotice: '当前为即时预览；点击应用后才会在重启后保留。',
  apply: '应用此皮肤', saving: '正在保存…', restore: '恢复官方默认', privacy: '图片仅保存在本机，不会上传到任何外部服务。',
  invalidType: '仅支持 PNG、JPEG 或 WebP 图片。', tooLarge: '图片不能超过 15 MB。', decodeFailed: '图片无法解析，或尺寸不在 320×180 至 12000×12000 范围内。',
  applyFailed: '应用失败', restoreFailed: '恢复失败',
}

export const en: Record<SkinCenterKey, string> = {
  title: 'Custom Theme', cardDescription: 'Upload one image and generate a coordinated, readable theme automatically.',
  intro: 'Keeps the official layout while adapting the backdrop, color mode, accent, and safe contrast.',
  choose: 'Choose theme image', formatHint: 'PNG / JPEG / WebP, up to 15 MB; landscape recommended', generatedPalette: 'Generated palette',
  themeLight: 'Light', themeDark: 'Dark', visibility: 'Wallpaper visibility', previewNotice: 'This is a live preview. Apply it to keep it after restart.',
  apply: 'Apply theme', saving: 'Saving…', restore: 'Restore official default', privacy: 'The image stays on this computer and is never uploaded externally.',
  invalidType: 'Only PNG, JPEG, and WebP images are supported.', tooLarge: 'The image must be 15 MB or smaller.', decodeFailed: 'The image cannot be decoded or its dimensions are outside 320×180–12000×12000.',
  applyFailed: 'Apply failed', restoreFailed: 'Restore failed',
}
