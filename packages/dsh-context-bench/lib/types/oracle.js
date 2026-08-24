const MARKDOWN_PRESENTATION = /(?:\*\*|__|`|~~|^\s{0,3}#{1,6}\s+|^\s*[-*+]\s+)/gm;
export function normalizeForMatch(value) {
    return value
        .normalize("NFKC")
        .replace(/\r\n?/g, "\n")
        .replace(MARKDOWN_PRESENTATION, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLocaleLowerCase("en-US");
}
export function containsExact(haystack, needle) {
    return normalizeForMatch(haystack).includes(normalizeForMatch(needle));
}
