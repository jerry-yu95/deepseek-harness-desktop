/** Size and batch limits for safe text attachments. */

/** Single safe-text ceiling (1 MiB); content reaches the model only through a paged tool. */
export const MAX_FILE_BYTES = 1024 * 1024

/** Single Open XML Office document ceiling (20 MiB). */
export const MAX_OFFICE_BYTES = 20 * 1024 * 1024

/** Maximum number of text files accepted in one paste or drop. */
export const MAX_FILES = 4

/** Combined ceiling for one paste or drop (40 MiB). */
export const MAX_TOTAL_BYTES = 40 * 1024 * 1024

/** Replacement token written in place of sensitive field values. */
export const REDACTED_VALUE = '<REDACTED>'

/** Tunable limits, used by tests to exercise the total-size path independently. */
export interface IntakeLimits {
  /** Max files in one event. */
  maxFiles: number
  /** Max bytes per file. */
  maxFileBytes: number
  /** Max bytes for one docx/xlsx/pptx file. */
  maxOfficeBytes?: number
  /** Max combined bytes in one event. */
  maxTotalBytes: number
}

/** Product defaults. */
export const DEFAULT_LIMITS: IntakeLimits = {
  maxFiles: MAX_FILES,
  maxFileBytes: MAX_FILE_BYTES,
  maxOfficeBytes: MAX_OFFICE_BYTES,
  maxTotalBytes: MAX_TOTAL_BYTES,
}

/** Why a batch of text files was rejected before reading. */
export type BatchLimitError = 'too-many' | 'too-large' | 'total-too-large'

/**
 * Check count / per-file / total size before reading bytes.
 * @param files - file-like objects with a byte size.
 * @param limits - ceilings to apply.
 * @returns the first limit that failed, or undefined when the batch is within bounds.
 */
export function batchLimitError(
  files: ReadonlyArray<{ size: number; kind?: 'text' | 'office' }>,
  limits: IntakeLimits = DEFAULT_LIMITS,
): BatchLimitError | undefined {
  if (files.length > limits.maxFiles) return 'too-many'
  if (files.some(file => file.size > (file.kind === 'office' ? (limits.maxOfficeBytes ?? MAX_OFFICE_BYTES) : limits.maxFileBytes))) return 'too-large'
  const total = files.reduce((sum, file) => sum + file.size, 0)
  if (total > limits.maxTotalBytes) return 'total-too-large'
  return undefined
}
