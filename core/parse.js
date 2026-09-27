// Splits what the user typed into a mode and a query. Pure JavaScript (no
// GNOME imports) so it can be unit-tested with Node.
//
//   "firefox"        -> {mode: 'all',      query: 'firefox'}
//   "@readme"        -> {mode: 'files',    query: 'readme'}
//   "/lock"          -> {mode: 'commands', query: 'lock'}
//   "= 2 * 3"        -> {mode: 'math',     query: '2 * 3'}
//   "!gh gnome"      -> {mode: 'web',      query: 'gh gnome'}
//   "? what is dns"  -> {mode: 'ai',       query: 'what is dns'}

export const MODES = Object.freeze({
    ALL: 'all',
    FILES: 'files',
    COMMANDS: 'commands',
    MATH: 'math',
    WEB: 'web',
    AI: 'ai',
});

const PREFIXES = new Map([
    ['@', MODES.FILES],
    ['/', MODES.COMMANDS],
    ['=', MODES.MATH],
    ['!', MODES.WEB],
    ['?', MODES.AI],
]);

/**
 * @param {string} input
 * @returns {{mode: string, prefix: string, query: string}}
 */
export function parse(input) {
    const text = input.trimStart();
    const mode = PREFIXES.get(text[0]);
    // "/" followed by more path is a file path, not a command ("/usr/bin").
    if (mode === MODES.COMMANDS && text.slice(1).includes('/'))
        return {mode: MODES.ALL, prefix: '', query: text.trim()};
    if (mode)
        return {mode, prefix: text[0], query: text.slice(1).trim()};
    return {mode: MODES.ALL, prefix: '', query: text.trim()};
}
