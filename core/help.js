import {bestScore} from './fuzzy.js';

// Examples fill the bar; they never execute an action just by being selected.
export const HELP_TOPICS = [
    ['apps', 'Search apps and windows', 'Type an app name or window title', 'firefox', 'applications launch switch'],
    ['files', '@ — Files and projects', 'Try @readme; a bare @ lists recent files', '@', 'folders repositories recent'],
    ['commands', '/ — Commands and tools', 'Browse system actions, developer tools and your commands', '/', 'lock suspend logout restart shutdown dark nightlight dnd screenshot'],
    ['math', '= — Calculator', 'Try = 2340 * 1.15; Enter copies the answer', '= 2340 * 1.15', 'calculate arithmetic copy'],
    ['web', '! — Web shortcuts', 'Try !gh ask-bar; Tab completes a shortcut', '!gh ask-bar', 'browser google youtube search websites'],
    ['ai', '? — Ask an AI app', 'Ask an installed Claude or ChatGPT app', '? Explain DNS in simple terms', 'assistant question'],
    ['favorites', 'Pin your favorites — Alt+Enter', 'Select an app, file, project or command, then choose Pin to Favorites. Clear the search to see your pins; use Alt+Enter again to unpin.', undefined, 'star save home unpin remove'],
    ['actions', 'More actions — Alt+Enter', 'Open in an editor or terminal, copy a path; Esc returns', undefined, 'keyboard shortcuts github gitlab'],
    ['reveal', 'Show a file in Files — Ctrl+Enter', 'Select a file or project, then press Ctrl+Enter', undefined, 'keyboard folder reveal location'],
    ['navigation', 'Navigate — ↑ ↓, Enter, Esc', 'Arrow keys select, Enter opens, Esc closes', undefined, 'keyboard shortcuts close'],
    ['json', '/json — Format JSON', 'Type JSON after the command, or use the clipboard', '/json {"hello":"world"}', 'developer minify jsonmin'],
    ['jwt', '/jwt — Decode a JWT', 'Use a token from the clipboard and inspect its expiry', '/jwt ', 'developer token expiration'],
    ['base64', '/b64 — Base64 encode', 'Use /b64d to decode; Enter copies the result', '/b64 hello', 'developer encoding decoding clipboard'],
    ['url', '/url — URL encode', 'Use /urld to decode; Enter copies the result', '/url hello world', 'developer encoding decoding'],
    ['timestamp', '/ts — Convert timestamps', 'Unix timestamp to date; no input shows the current time', '/ts ', 'developer time date unix'],
    ['uuid', '/uuid — Generate a UUID', 'Enter copies a new UUID v4', '/uuid ', 'developer random identifier'],
    ['password', '/password — Generate a password', 'Enter copies a strong password', '/password ', 'developer random secure'],
    ['hash', '/sha256 — Hash text', 'Also available: /sha1 and /md5', '/sha256 hello', 'developer checksum'],
    ['case', '/snake — Convert text case', 'Also: /camel /kebab /pascal /constant /title /upper /lower', '/snake Hello World', 'developer text uppercase lowercase'],
    ['count', '/count — Count text', 'Count characters, words and lines', '/count hello world', 'developer length clipboard'],
    ['settings', '/askbar — Ask Bar settings', 'Change the shortcut, search sources, appearance and custom commands', '/askbar', 'preferences configure shortcuts'],
];

export function searchHelp(query) {
    return HELP_TOPICS.map(([id, title, subtitle, fill, keywords]) => ({
        id: `help:${id}`, title, subtitle, fill,
        score: query ? bestScore(query, [title, keywords, subtitle, fill]) : 0,
    })).filter(item => item.score !== null).sort((a, b) => b.score - a.score);
}
