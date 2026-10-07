// Clipboard history bookkeeping: a recency-ordered list of texts, searched
// by words. Pure JavaScript, unit-tested with Node. Entries are
// {text, time} and live only in memory (see providers/clipboard.js).

const TITLE_LENGTH = 80;
export const MAX_TEXT_LENGTH = 100_000; // longer copies are not kept

/**
 * Adds a copied text at the front, dropping an earlier copy of the same
 * text and anything over `max`. Blank or oversized text is ignored.
 *
 * @param {Array<{text: string, time: number}>} entries  newest first
 * @param {string} text
 * @param {number} now  ms
 * @param {number} max
 * @returns {Array<{text: string, time: number}>} a new array
 */
export function addEntry(entries, text, now, max) {
    if (!text || !text.trim() || text.length > MAX_TEXT_LENGTH)
        return entries;
    return [{text, time: now}, ...entries.filter(e => e.text !== text)].slice(0, Math.max(1, max));
}

export function removeEntry(entries, text) {
    return entries.filter(e => e.text !== text);
}

/**
 * Entries containing every word of the query, newest first. Without a
 * query, the newest `limit` entries.
 *
 * @returns {Array<{text: string, time: number, score: number}>}
 */
export function searchEntries(entries, query, limit) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const found = [];
    for (const [index, entry] of entries.entries()) {
        if (words.length) {
            const lower = entry.text.toLowerCase();
            if (!words.every(w => lower.includes(w)))
                continue;
        }
        found.push({...entry, score: entries.length - index});
        if (found.length >= limit)
            break;
    }
    return found;
}

/**
 * The first non-empty line, trimmed and shortened, as a row title.
 *
 * @param {string} text
 * @returns {string}
 */
export function summarize(text) {
    const line = text.split('\n').map(l => l.trim()).find(Boolean) ?? '';
    const flat = line.replace(/\s+/g, ' ');
    return flat.length > TITLE_LENGTH ? `${flat.slice(0, TITLE_LENGTH)}…` : flat;
}

/**
 * "42 characters · 3 lines · 5 min ago"
 *
 * @param {{text: string, time: number}} entry
 * @param {number} now  ms
 * @returns {string}
 */
export function describeEntry(entry, now) {
    const lines = entry.text.split('\n').length;
    const parts = [`${entry.text.length} character${entry.text.length === 1 ? '' : 's'}`];
    if (lines > 1)
        parts.push(`${lines} lines`);
    parts.push(relativeTime(entry.time, now));
    return parts.join(' · ');
}

export function relativeTime(then, now) {
    const s = Math.max(0, Math.round((now - then) / 1000));
    if (s < 60)
        return 'just now';
    const m = Math.round(s / 60);
    if (m < 60)
        return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24)
        return `${h} h ago`;
    const d = Math.round(h / 24);
    return d === 1 ? 'yesterday' : `${d} days ago`;
}
