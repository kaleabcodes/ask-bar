// Learns which result you pick for what you type, so it ranks higher next
// time. Pure JavaScript, unit-tested with Node.
//
// History shape: { "<query>": { "<resultId>": {count, last} } }, where
// query includes the mode prefix ("te", "@readme", "/js").

const HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000; // choices fade over ~2 weeks
const MAX_BONUS = 60;     // enough to reorder close matches, not to beat far better ones
const EXACT_WEIGHT = 1;   // same query as when the choice was made
const RELATED_WEIGHT = 0.5; // a longer or shorter version of it ("te" vs "ter")
const MAX_QUERIES = 300;

// Results whose ids aren't stable across sessions or queries aren't learned.
const UNLEARNED = /^(window|web|url|calc|notice|status|ai|soon):/;

export function normalizeQuery(query) {
    return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function isLearnable(id) {
    return Boolean(id) && !UNLEARNED.test(id);
}

/**
 * Records that `id` was chosen for `query`. Mutates and returns `history`.
 *
 * @param {object} history
 * @param {string} query
 * @param {string} id
 * @param {number} now  ms
 * @returns {object}
 */
export function recordChoice(history, query, id, now) {
    const q = normalizeQuery(query);
    if (!q || !isLearnable(id))
        return history;
    history[q] ??= {};
    const entry = history[q][id] ??= {count: 0, last: 0};
    entry.count += 1;
    entry.last = now;
    prune(history);
    return history;
}

/**
 * Ranking bonus for `id` given what's typed now.
 *
 * @param {object} history
 * @param {string} query
 * @param {string} id
 * @param {number} now  ms
 * @returns {number} 0..MAX_BONUS
 */
export function learnedBonus(history, query, id, now) {
    const q = normalizeQuery(query);
    if (!q || !isLearnable(id))
        return 0;
    let weight = 0;
    for (const [stored, choices] of Object.entries(history)) {
        const entry = choices[id];
        if (!entry)
            continue;
        const relation = stored === q ? EXACT_WEIGHT
            : stored.startsWith(q) || q.startsWith(stored) ? RELATED_WEIGHT : 0;
        if (relation)
            weight += relation * entry.count * 0.5 ** ((now - entry.last) / HALF_LIFE_MS);
    }
    // Saturates: the first few choices matter most, then it levels off.
    return MAX_BONUS * (1 - Math.exp(-weight / 2));
}

// Keeps the most recently used queries.
function prune(history) {
    const queries = Object.keys(history);
    if (queries.length <= MAX_QUERIES)
        return;
    const lastUse = q => Math.max(...Object.values(history[q]).map(e => e.last));
    queries.sort((a, b) => lastUse(b) - lastUse(a));
    for (const q of queries.slice(MAX_QUERIES))
        delete history[q];
}
