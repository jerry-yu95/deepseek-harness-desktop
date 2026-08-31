/**
 * text-context copy: zh is the key source, en mirrors every key.
 * Core logic looks up these keys; it must not embed Chinese literals.
 */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'block.reference': '文件附件：{name}',
  'toast.added': '已添加 {count} 个可读取文件',
  'toast.redacted': '已自动隐藏可能的密钥字段',
  'toast.tooLarge': '文件超过当前格式的大小上限',
  'toast.tooMany': '一次最多添加 4 个文件',
  'toast.totalTooLarge': '附件总大小超过 40 MiB',
  'toast.invalidUtf8': '文件不是有效 UTF-8',
  'toast.binary': '文件包含无效或二进制内容',
  'toast.unsupported': '当前支持图片、安全文本和 docx/xlsx/pptx 文件',
  'toast.mixed': '请将图片和文档分开上传',
  'toast.noComposer': '未找到当前会话输入框',
  'toast.jsonInvalid': 'JSON 无法解析，已按纯文本做保守脱敏，请检查后修复',
  'toast.unsafeRedact': '无法安全隐藏密钥字段，已阻止导入',
  'toast.sensitiveFile': '已阻止可能包含密钥的敏感文件',
  'toast.sessionSwitched': '会话已切换，请重新添加文件',
  'toast.storeFailed': '文件保存失败，请重试',
  'composer.placeholder': '给智能体发消息',
} satisfies Record<string, string>

/** English mirrors the zh key set. */
export const en: { [K in keyof typeof zh]: string } = {
  'block.reference': 'File attachment: {name}',
  'toast.added': 'Added {count} tool-readable file(s)',
  'toast.redacted': 'Possible secret fields were hidden automatically',
  'toast.tooLarge': 'File exceeds the size limit for this format',
  'toast.tooMany': 'At most 4 files can be added at once',
  'toast.totalTooLarge': 'Attachments exceed 40 MiB in total',
  'toast.invalidUtf8': 'File is not valid UTF-8',
  'toast.binary': 'File contains invalid or binary content',
  'toast.unsupported': 'Images, safe text, and docx/xlsx/pptx files are supported',
  'toast.mixed': 'Please upload images and documents separately',
  'toast.noComposer': 'Could not find the current session input',
  'toast.jsonInvalid': 'JSON could not be parsed; conservative redaction was applied. Please fix the file.',
  'toast.unsafeRedact': 'Could not safely hide secret fields; the file was not added',
  'toast.sensitiveFile': 'Blocked a sensitive file that may contain secrets',
  'toast.sessionSwitched': 'The session changed. Please add the file again.',
  'toast.storeFailed': 'Could not store the file. Please try again.',
  'composer.placeholder': 'Message the agent',
}

/** Locale key union. */
export type MessageKey = keyof typeof zh

/** Tiny interpolation: {name} -> value. */
export function t(
  dictionary: Record<string, string>,
  key: string,
  values?: Record<string, string | number>,
): string {
  let text = dictionary[key] ?? key
  if (values !== undefined) {
    for (const [name, value] of Object.entries(values)) {
      text = text.replaceAll(`{${name}}`, String(value))
    }
  }
  return text
}

/**
 * Pick zh or en from a BCP 47 tag. Default zh (product UI is Chinese-first).
 * @param lang - documentElement.lang or navigator.language.
 */
export function dictionaryFor(lang: string | undefined): Record<MessageKey, string> {
  const tag = (lang ?? '').toLowerCase()
  return tag.startsWith('en') ? en : zh
}

/** Translate using the document language. */
export function translate(
  key: MessageKey,
  values?: Record<string, string | number>,
  lang?: string,
): string {
  const resolved = lang ?? (typeof document === 'undefined' ? 'zh' : document.documentElement.lang)
  return t(dictionaryFor(resolved), key, values)
}
