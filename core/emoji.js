// Emoji and symbol search for the ":" prefix. Pure JavaScript, unit-tested
// with Node. The emoji list is generated into emojiData.js; symbols and
// kaomoji below are hand-picked.

import {EMOJI_DATA} from './emojiData.js';
import {bestScore} from './fuzzy.js';

/**
 * @typedef {object} Glyph
 * @property {string} char
 * @property {string} name
 * @property {string} keywords
 * @property {string} group
 * @property {boolean} [text]  a plain-text symbol rather than an emoji
 */

// [char, name, keywords]
export const SYMBOLS = [
    ['→', 'right arrow', 'arrow right next forward'],
    ['←', 'left arrow', 'arrow left back previous'],
    ['↑', 'up arrow', 'arrow up'],
    ['↓', 'down arrow', 'arrow down'],
    ['↔', 'left right arrow', 'arrow both horizontal'],
    ['⇒', 'rightwards double arrow', 'arrow implies'],
    ['⇐', 'leftwards double arrow', 'arrow implied'],
    ['⇔', 'left right double arrow', 'arrow iff equivalent'],
    ['↵', 'return', 'enter newline carriage'],
    ['✓', 'check mark', 'tick yes done ok'],
    ['✗', 'ballot x', 'cross no wrong'],
    ['•', 'bullet', 'dot list point'],
    ['·', 'middle dot', 'interpunct separator'],
    ['…', 'ellipsis', 'dots three'],
    ['–', 'en dash', 'dash range'],
    ['—', 'em dash', 'dash long'],
    ['−', 'minus sign', 'math subtract'],
    ['×', 'multiplication sign', 'math times x'],
    ['÷', 'division sign', 'math divide'],
    ['±', 'plus minus sign', 'math'],
    ['≠', 'not equal to', 'math'],
    ['≈', 'almost equal to', 'math approximately'],
    ['≤', 'less than or equal to', 'math'],
    ['≥', 'greater than or equal to', 'math'],
    ['∞', 'infinity', 'math'],
    ['√', 'square root', 'math radical'],
    ['∑', 'summation', 'math sum sigma'],
    ['∏', 'product', 'math pi'],
    ['∫', 'integral', 'math'],
    ['∂', 'partial differential', 'math'],
    ['∆', 'increment', 'math delta'],
    ['∈', 'element of', 'math set in'],
    ['∅', 'empty set', 'math null'],
    ['°', 'degree sign', 'temperature angle'],
    ['′', 'prime', 'minutes feet'],
    ['″', 'double prime', 'seconds inches'],
    ['‰', 'per mille', 'permille'],
    ['½', 'one half', 'fraction'],
    ['⅓', 'one third', 'fraction'],
    ['¼', 'one quarter', 'fraction'],
    ['¾', 'three quarters', 'fraction'],
    ['²', 'superscript two', 'squared power'],
    ['³', 'superscript three', 'cubed power'],
    ['µ', 'micro sign', 'mu micro'],
    ['§', 'section sign', 'paragraph legal'],
    ['¶', 'pilcrow', 'paragraph'],
    ['†', 'dagger', 'footnote'],
    ['‡', 'double dagger', 'footnote'],
    ['‽', 'interrobang', 'question exclamation'],
    ['¿', 'inverted question mark', 'spanish'],
    ['¡', 'inverted exclamation mark', 'spanish'],
    ['“', 'left double quotation mark', 'quote curly open'],
    ['”', 'right double quotation mark', 'quote curly close'],
    ['‘', 'left single quotation mark', 'quote curly open apostrophe'],
    ['’', 'right single quotation mark', 'quote curly close apostrophe'],
    ['«', 'left guillemet', 'quote angle french'],
    ['»', 'right guillemet', 'quote angle french'],
    ['©', 'copyright sign', 'legal'],
    ['®', 'registered sign', 'legal trademark'],
    ['™', 'trade mark sign', 'legal trademark'],
    ['€', 'euro sign', 'currency money'],
    ['£', 'pound sign', 'currency money sterling'],
    ['¥', 'yen sign', 'currency money yuan'],
    ['₹', 'rupee sign', 'currency money india'],
    ['¢', 'cent sign', 'currency money'],
    ['₩', 'won sign', 'currency money korea'],
    ['₿', 'bitcoin sign', 'currency crypto'],
    ['α', 'alpha', 'greek letter'],
    ['β', 'beta', 'greek letter'],
    ['γ', 'gamma', 'greek letter'],
    ['δ', 'delta', 'greek letter'],
    ['ε', 'epsilon', 'greek letter'],
    ['θ', 'theta', 'greek letter'],
    ['λ', 'lambda', 'greek letter'],
    ['μ', 'mu', 'greek letter'],
    ['π', 'pi', 'greek letter math'],
    ['σ', 'sigma', 'greek letter'],
    ['τ', 'tau', 'greek letter'],
    ['φ', 'phi', 'greek letter'],
    ['ω', 'omega', 'greek letter'],
    ['Δ', 'capital delta', 'greek letter change'],
    ['Σ', 'capital sigma', 'greek letter sum'],
    ['Ω', 'capital omega', 'greek letter ohm'],
    ['⌘', 'command key', 'mac keyboard cmd'],
    ['⌥', 'option key', 'mac keyboard alt'],
    ['⇧', 'shift key', 'keyboard'],
    ['⌃', 'control key', 'keyboard ctrl'],
    ['⏎', 'return key', 'keyboard enter'],
    ['⌫', 'backspace key', 'keyboard delete'],
    ['⇥', 'tab key', 'keyboard'],
    ['⎋', 'escape key', 'keyboard esc'],
    ['¯\\_(ツ)_/¯', 'shrug', 'kaomoji dunno whatever'],
    ['ಠ_ಠ', 'look of disapproval', 'kaomoji stare'],
    ['(╯°□°)╯︵ ┻━┻', 'table flip', 'kaomoji rage angry'],
    ['┬─┬ノ( º _ ºノ)', 'put the table back', 'kaomoji calm'],
    ['(ノ◕ヮ◕)ノ*:･ﾟ✧', 'sparkle throw', 'kaomoji happy magic'],
    ['(•_•)', 'blank stare', 'kaomoji'],
    ['( ͡° ͜ʖ ͡°)', 'lenny face', 'kaomoji'],
    ['ʕ•ᴥ•ʔ', 'bear', 'kaomoji cute'],
];

// An exact name or keyword beats a longer name that merely starts with
// the query (":lol" is 😄 before 🍭 lollipop). Fuzzy scores top out
// around 170, so these are fixed tiers above them.
const EXACT_NAME_SCORE = 250;
const NAME_WORD_SCORE = 220;
const EXACT_KEYWORD_SCORE = 200;

let glyphs = null;

/** @returns {Glyph[]} emoji first, then symbols */
export function allGlyphs() {
    if (!glyphs) {
        glyphs = [
            ...EMOJI_DATA.map(line => {
                const [char, name, keywords, group] = line.split('|');
                return {char, name, keywords, group};
            }),
            ...SYMBOLS.map(([char, name, keywords]) => ({char, name, keywords, group: 'Symbols', text: true})),
        ];
    }
    return glyphs;
}

/**
 * @param {string} query
 * @param {number} limit
 * @returns {Array<Glyph & {score: number}>}  best first; the first `limit`
 *     glyphs in list order when the query is empty
 */
export function searchGlyphs(query, limit) {
    const q = query.trim().replace(/^:|:$/g, '');
    const all = allGlyphs();
    if (!q)
        return all.slice(0, limit).map(g => ({...g, score: 0}));
    const lower = q.toLowerCase();
    const found = [];
    let words;
    for (const g of all) {
        let score = bestScore(q, [g.name, g.keywords, g.group]);
        if (score === null)
            continue;
        if (g.name.toLowerCase() === lower)
            // A text symbol (→) beats its emoji twin (➡️): it pastes as plain text
            score = EXACT_NAME_SCORE + (g.text ? 1 : 0);
        else if ((words = g.name.toLowerCase().split(/[\s:,-]+/)).includes(lower))
            // Shorter names first: "OK hand" before "woman gesturing OK"
            score = NAME_WORD_SCORE - words.length + score / 100;
        else if (g.keywords.split(' ').includes(lower))
            score = EXACT_KEYWORD_SCORE + score / 100;
        found.push({...g, score});
    }
    return found.sort((a, b) => b.score - a.score).slice(0, limit);
}
