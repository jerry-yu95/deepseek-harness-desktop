const MARKDOWN_PRESENTATION = /(?:\*\*|__|`|~~|^\s{0,3}#{1,6}\s+|^\s*[-*+]\s+)/gm;

export function normalizeForMatch(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(MARKDOWN_PRESENTATION, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}

export function containsExact(haystack: string, needle: string): boolean {
  return normalizeForMatch(haystack).includes(normalizeForMatch(needle));
}
