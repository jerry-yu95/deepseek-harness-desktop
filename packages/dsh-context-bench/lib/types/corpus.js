export const CONTEXT_SCALE_TOKENS = {
    "8K": 8_192,
    "32K": 32_768,
    "128K": 131_072,
    "1M-policy": 1_000_000,
};
const MATERIALIZED_MESSAGE_COUNTS = {
    "8K": 64,
    "32K": 256,
    "128K": 1_024,
    "1M-policy": 1_024,
};
function makePrng(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
    };
}
function estimateTokens(content) {
    return Math.max(1, Math.ceil(Buffer.byteLength(content, "utf8") / 4));
}
function positionRatio(position) {
    if (position === "early")
        return 0.1;
    if (position === "middle")
        return 0.5;
    return 0.9;
}
function filler(index, random) {
    const subjects = ["scheduler", "renderer", "workspace", "adapter", "telemetry", "cache"];
    const actions = ["validated", "reviewed", "measured", "queued", "replayed", "indexed"];
    const subject = subjects[Math.floor(random() * subjects.length)];
    const action = actions[Math.floor(random() * actions.length)];
    const content = `Synthetic engineering note ${index}: ${subject} ${action}; marker ${Math.floor(random() * 1_000_000)}.`;
    return {
        id: `filler-${String(index).padStart(4, "0")}`,
        role: index % 2 === 0 ? "user" : "assistant",
        kind: "filler",
        content,
        estimatedTokens: estimateTokens(content),
    };
}
function nearestFreeIndex(preferred, occupied, length) {
    if (!occupied.has(preferred))
        return preferred;
    for (let distance = 1; distance < length; distance += 1) {
        const after = preferred + distance;
        if (after < length && !occupied.has(after))
            return after;
        const before = preferred - distance;
        if (before >= 0 && !occupied.has(before))
            return before;
    }
    throw new Error("synthetic corpus has no free placement slot");
}
export function buildSyntheticCorpus(fixture, options) {
    const scale = options.scale ?? fixture.contextScale;
    const targetTokenBudget = CONTEXT_SCALE_TOKENS[scale];
    const messageCount = Math.max(MATERIALIZED_MESSAGE_COUNTS[scale], fixture.transcript.length + 1);
    const random = makePrng(options.seed);
    const messages = Array.from({ length: messageCount }, (_, index) => filler(index, random));
    const placements = {};
    const occupied = new Set();
    for (const segment of fixture.transcript) {
        const preferred = Math.round((messageCount - 1) * positionRatio(segment.position));
        const index = nearestFreeIndex(preferred, occupied, messageCount);
        occupied.add(index);
        placements[segment.id] = index;
        messages[index] = {
            id: `source-${segment.id}`,
            role: segment.role,
            kind: segment.kind,
            content: segment.content,
            sourceSegmentId: segment.id,
            estimatedTokens: estimateTokens(segment.content),
        };
    }
    const estimatedMaterializedTokens = messages.reduce((total, message) => total + message.estimatedTokens, 0);
    if (estimatedMaterializedTokens > targetTokenBudget) {
        throw new Error(`materialized corpus exceeds ${scale} token budget`);
    }
    return {
        fixtureId: fixture.id,
        seed: options.seed,
        scale,
        targetTokenBudget,
        estimatedMaterializedTokens,
        policyOnly: scale === "1M-policy",
        placements,
        messages,
    };
}
