// File-search logic that doesn't need GNOME: parsing localsearch and
// recent-files output, and ranking paths. Unit-tested with Node.

import {fuzzyScore} from './fuzzy.js';

// Paths that are rarely what you're looking for: SDKs, dependencies, caches.
const NOISE = [
    /\/node_modules\//, /\/\.[^/]+\//, /\/Android\/Sdk\//, /\/site-packages\//,
    /\/vendor\//, /\/build\//, /\/dist\//, /\/target\//, /\/jre\//, /\/snap\//,
    /\/Compressed\//, /\/__pycache__\//,
    /\/go\/pkg\//, /\/\.?cargo\/registry\//, /\/gems\//, /\/\.m2\//,
];

const NOISE_PENALTY = 60;
const DEPTH_PENALTY = 2.5;      // per folder level below home
const EXACT_NAME_BONUS = 80;    // "readme" -> README
const PROJECT_BONUS = 40;       // git repositories are usually what developers want
const FOLDER_BONUS = 5;

/**
 * Converts a file:// URI to a path ("file:///a%20b" -> "/a b").
 *
 * @param {string} uri
 * @returns {string|null}
 */
export function uriToPath(uri) {
    if (!uri.startsWith('file://'))
        return null;
    try {
        return decodeURIComponent(uri.slice('file://'.length));
    } catch {
        return null;
    }
}

/**
 * @param {string} path
 * @returns {string}
 */
export function pathToUri(path) {
    return `file://${path.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * `localsearch search` prints one URI per line.
 *
 * @param {string} output
 * @returns {string[]} paths
 */
export function parseLocalsearch(output) {
    return output.split('\n')
        .map(line => line.trim())
        .filter(line => line.startsWith('file://'))
        .map(uriToPath)
        .filter(Boolean);
}

/**
 * Reads GNOME's recently-used.xbel and returns local files, newest first.
 *
 * @param {string} xml
 * @returns {string[]} paths
 */
export function parseRecentFiles(xml) {
    const entries = [];
    for (const match of xml.matchAll(/<bookmark\s[^>]*>/g)) {
        const tag = match[0];
        const href = /href="([^"]+)"/.exec(tag)?.[1];
        const modified = /modified="([^"]+)"/.exec(tag)?.[1] ?? '';
        const path = href ? uriToPath(decodeXmlEntities(href)) : null;
        if (path)
            entries.push({path, modified});
    }
    entries.sort((a, b) => b.modified.localeCompare(a.modified));
    return [...new Set(entries.map(e => e.path))];
}

/**
 * Scores a path for a query; null when the name doesn't match.
 *
 * @param {string} query
 * @param {string} path
 * @param {{home: string, isFolder?: boolean, isProject?: boolean}} options
 * @returns {number|null}
 */
export function scorePath(query, path, {home, isFolder = false, isProject = false}) {
    const name = basename(path);
    // Match the name first; fall back to the whole path (e.g. "repo/ask").
    let score = fuzzyScore(query, name);
    if (score === null) {
        const inPath = fuzzyScore(query, path.startsWith(home) ? path.slice(home.length) : path);
        if (inPath === null)
            return null;
        score = inPath * 0.5;
    }

    const stem = name.replace(/\.[^.]+$/, '').toLowerCase();
    if (stem === query.toLowerCase() || name.toLowerCase() === query.toLowerCase())
        score += EXACT_NAME_BONUS;
    if (isProject)
        score += PROJECT_BONUS;
    if (isFolder)
        score += FOLDER_BONUS;
    if (NOISE.some(re => re.test(path)))
        score -= NOISE_PENALTY;

    const relative = path.startsWith(home) ? path.slice(home.length) : path;
    score -= (relative.split('/').length - 2) * DEPTH_PENALTY;
    return score;
}

/**
 * "~/Desktop/repo" style display of a path's folder.
 *
 * @param {string} path
 * @param {string} home
 * @returns {string}
 */
export function displayFolder(path, home) {
    const folder = path.slice(0, path.lastIndexOf('/')) || '/';
    return folder.startsWith(home) ? `~${folder.slice(home.length)}` : folder;
}

export function basename(path) {
    return path.slice(path.lastIndexOf('/') + 1);
}

function decodeXmlEntities(text) {
    return text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}
