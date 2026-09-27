// Web search shortcuts ("bangs") and URL detection. Pure JavaScript,
// unit-tested with Node.
//
//   "gh ask-bar"   -> GitHub search for "ask-bar"
//   "example.com"  -> https://example.com

/** @typedef {{key: string, name: string, url: string}} Bang  url contains %s */

/** @type {Bang[]} */
export const DEFAULT_BANGS = [
    {key: 'g', name: 'Google', url: 'https://www.google.com/search?q=%s'},
    {key: 'ddg', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s'},
    {key: 'gh', name: 'GitHub', url: 'https://github.com/search?q=%s'},
    {key: 'yt', name: 'YouTube', url: 'https://www.youtube.com/results?search_query=%s'},
    {key: 'so', name: 'Stack Overflow', url: 'https://stackoverflow.com/search?q=%s'},
    {key: 'w', name: 'Wikipedia', url: 'https://en.wikipedia.org/w/index.php?search=%s'},
    {key: 'mdn', name: 'MDN Web Docs', url: 'https://developer.mozilla.org/search?q=%s'},
    {key: 'npm', name: 'npm', url: 'https://www.npmjs.com/search?q=%s'},
    {key: 'pypi', name: 'PyPI', url: 'https://pypi.org/search/?q=%s'},
    {key: 'maps', name: 'Google Maps', url: 'https://www.google.com/maps/search/%s'},
];

/**
 * Custom shortcuts replace defaults with the same key.
 *
 * @param {Bang[]} custom
 * @returns {Bang[]}
 */
export function mergeBangs(custom) {
    const valid = custom.filter(b => b?.key && b?.name && b?.url?.includes('%s'))
        .map(b => ({...b, key: b.key.toLowerCase().replace(/^!/, '')}));
    const keys = new Set(valid.map(b => b.key));
    return [...valid, ...DEFAULT_BANGS.filter(b => !keys.has(b.key))];
}

/**
 * Splits "gh ask bar" into the shortcut key and the search terms.
 *
 * @param {string} query  text after "!"
 * @param {Bang[]} bangs
 * @returns {{bang: Bang|null, key: string, terms: string}}
 */
export function parseBang(query, bangs) {
    const [key = '', ...rest] = query.trim().split(/\s+/);
    const bang = bangs.find(b => b.key === key.toLowerCase()) ?? null;
    return {bang, key, terms: rest.join(' ')};
}

/**
 * @param {Bang} bang
 * @param {string} terms
 * @returns {string}
 */
export function buildUrl(bang, terms) {
    return bang.url.replaceAll('%s', encodeURIComponent(terms));
}

/**
 * A URL to open when the text looks like an address: "https://x.y/z",
 * "example.com", "localhost:3000". Plain words and math don't match.
 *
 * @param {string} text
 * @returns {string|null}
 */
export function asUrl(text) {
    const t = text.trim();
    if (!t || /\s/.test(t))
        return null;
    if (/^https?:\/\/\S+$/i.test(t))
        return t;
    if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/\S*)?$/i.test(t))
        return `http://${t}`;
    // domain.tld with an alphabetic TLD of 2+ letters, optional port and path
    if (/^([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(t) && !/^\d+(\.\d+)*$/.test(t))
        return `https://${t}`;
    return null;
}
