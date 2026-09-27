// Fuzzy matching for the result list. Pure JavaScript, unit-tested with Node.
//
// Every query character must appear in order in the text. Matches score
// higher when they start words, run consecutively, or begin the text, so
// "fire" ranks "Firefox" above "Keyboard Configurator".

const SCORE_START = 10;       // match at the very beginning
const SCORE_WORD_START = 6;   // match at the start of a word
const SCORE_CONSECUTIVE = 4;  // match right after the previous match
const SCORE_MATCH = 1;
const PENALTY_GAP = 0.1;      // per skipped character
const WORD_BOUNDARY = /[\s\-_./:()]/;

/**
 * @param {string} query
 * @param {string} text
 * @returns {number|null} a score (higher is better), or null if no match
 */
export function fuzzyScore(query, text) {
    const q = query.toLowerCase();
    const t = text.toLowerCase();
    if (q.length === 0)
        return 0;
    if (q.length > t.length)
        return null;

    // An exact substring beats any scattered match.
    const substring = t.indexOf(q);
    if (substring >= 0) {
        const atWord = substring === 0 || WORD_BOUNDARY.test(t[substring - 1]);
        return 100 + (substring === 0 ? 50 : 0) + (atWord ? 20 : 0) - substring * PENALTY_GAP -
            (t.length - q.length) * 0.01;
    }

    let score = 0;
    let ti = 0;
    let previous = -2;
    for (const ch of q) {
        const found = t.indexOf(ch, ti);
        if (found < 0)
            return null;
        if (found === 0)
            score += SCORE_START;
        else if (WORD_BOUNDARY.test(t[found - 1]))
            score += SCORE_WORD_START;
        if (found === previous + 1)
            score += SCORE_CONSECUTIVE;
        score += SCORE_MATCH - (found - ti) * PENALTY_GAP;
        previous = found;
        ti = found + 1;
    }
    return score;
}

/**
 * Best score of the query against several fields (name, keywords…), with
 * later fields weighted down.
 *
 * @param {string} query
 * @param {Array<string|null|undefined>} fields  most important first
 * @returns {number|null}
 */
export function bestScore(query, fields) {
    let best = null;
    fields.forEach((field, i) => {
        if (!field)
            return;
        const s = fuzzyScore(query, field);
        if (s !== null) {
            const weighted = s * (1 - i * 0.15);
            if (best === null || weighted > best)
                best = weighted;
        }
    });
    return best;
}
