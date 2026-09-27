// "@" file search.
//
// Sources, merged and re-ranked by core/files.js:
// - GNOME's file index via `localsearch search` (fast; covers the home folder)
// - git repositories, which the index skips entirely, found by a periodic
//   background scan and cached
// - with an empty query, recently used files

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {
    basename, displayFolder, parseLocalsearch, parseRecentFiles, pathToUri, scorePath,
} from '../core/files.js';
import {isCancelled, readFile, run, sleep} from '../lib/async.js';

const DEBOUNCE_MS = 80;           // wait for a pause in typing before searching
const INDEX_LIMIT = 80;           // fetch plenty; our ranking picks the best
const PROJECT_SCAN_EVERY_MS = 10 * 60 * 1000;
const ICON_SIZE = 32;
// In the default search, only clear name matches are worth showing next to
// apps (fuzzy scatter matches would be noise). Substring matches score 100+.
const DEFAULT_MODE_MIN_SCORE = 90;
const DEFAULT_MODE_MIN_QUERY = 3;

// Big folders that never contain your projects; skipping them keeps the scan fast.
const SCAN_SKIP = ['node_modules', 'snap', 'Android', 'go', 'venv', 'flatpak'];

export class FilesProvider {
    /** @param {Gio.Settings} settings */
    constructor(settings) {
        this._settings = settings;
        this._home = GLib.get_home_dir();
        this._projects = [];         // paths of git repositories
        this._projectsScannedAt = 0;
        this._scanning = false;
        this._cancellable = new Gio.Cancellable();
    }

    // Called when the bar opens, so projects are fresh by the time you type.
    prefetch() {
        if (!this._settings.get_boolean('index-projects')) {
            this._projects = [];
            return;
        }
        if (!this._scanning && Date.now() - this._projectsScannedAt > PROJECT_SCAN_EVERY_MS)
            this._scanProjects();
    }

    /**
     * The few best file matches, for the default (no prefix) search.
     *
     * @param {string} query
     * @param {Gio.Cancellable} cancellable
     * @param {number} limit
     * @returns {Promise<import('./types.js').Result[]>}
     */
    async searchTop(query, cancellable, limit) {
        if (query.length < DEFAULT_MODE_MIN_QUERY)
            return [];
        const results = await this.search(query, cancellable);
        return results
            .filter(r => r.score >= DEFAULT_MODE_MIN_SCORE)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }

    /**
     * @param {string} query
     * @param {Gio.Cancellable} cancellable  cancelled when the query changes
     * @returns {Promise<import('./types.js').Result[]>}
     */
    async search(query, cancellable) {
        if (!query)
            return this._recentFiles(cancellable);

        await sleep(DEBOUNCE_MS, cancellable);
        const words = query.split(/[\s/]+/).filter(Boolean);
        const [files, folders] = await Promise.all([
            this._index(['-f', ...words], cancellable),
            this._index(['-s', ...words], cancellable),
        ]);
        const folderSet = new Set(folders);
        const projects = this._settings.get_boolean('index-projects') ? this._projects : [];
        const projectSet = new Set(projects);

        const seen = new Set();
        const results = [];
        for (const path of [...projects, ...folders, ...files]) {
            if (seen.has(path))
                continue;
            seen.add(path);
            const isProject = projectSet.has(path);
            const isFolder = isProject || folderSet.has(path);
            const score = scorePath(query, path, {home: this._home, isFolder, isProject});
            if (score !== null)
                results.push(this._result(path, score, {isFolder, isProject}));
        }
        return results;
    }

    async _index(args, cancellable) {
        try {
            return parseLocalsearch(await run(['localsearch', 'search', '-l', `${INDEX_LIMIT}`, ...args], cancellable));
        } catch (e) {
            if (isCancelled(e))
                throw e;
            return []; // localsearch not installed or not running: projects still work
        }
    }

    async _recentFiles(cancellable) {
        const xml = await readFile(`${GLib.get_user_data_dir()}/recently-used.xbel`, cancellable);
        if (!xml)
            return [];
        // Check existence only until we have enough (each check hits the disk).
        const limit = this._settings.get_int('recent-files-count');
        const existing = [];
        for (const path of parseRecentFiles(xml)) {
            if (existing.length >= limit)
                break;
            if (GLib.file_test(path, GLib.FileTest.EXISTS))
                existing.push(path);
        }
        return existing.map((path, i) => this._result(path, 100 - i, {
                isFolder: GLib.file_test(path, GLib.FileTest.IS_DIR),
                isProject: false,
                kind: 'Recent',
            }));
    }

    // Finds git repositories under home, skipping hidden folders (except the
    // ".git" we're looking for) and large dependency folders.
    async _scanProjects() {
        this._scanning = true;
        const prune = SCAN_SKIP.flatMap(name => ['-o', '-name', name]);
        try {
            const out = await run([
                'find', this._home, '-maxdepth', `${this._settings.get_int('project-scan-depth')}`,
                '-name', '.git', '-print', '-prune',
                '-o', '(', '-name', '.*', ...prune, ')', '-prune',
            ], this._cancellable);
            this._projects = out.split('\n').filter(Boolean).map(p => p.replace(/\/\.git$/, ''));
            this._projectsScannedAt = Date.now();
        } catch (e) {
            if (!isCancelled(e))
                console.warn(`[ask-bar] project scan failed: ${e.message}`);
        } finally {
            this._scanning = false;
        }
    }

    _result(path, score, {isFolder, isProject, kind = null}) {
        const uri = pathToUri(path);
        return {
            id: `file:${path}`,
            title: basename(path),
            subtitle: displayFolder(path, this._home),
            kind: kind ?? (isProject ? 'Project' : isFolder ? 'Folder' : 'File'),
            score,
            createIcon: () => new St.Icon({gicon: iconFor(path, isFolder, isProject), icon_size: ICON_SIZE}),
            activate: () => openUri(uri),
            altActivate: () => showInFiles(uri),
            altLabel: 'Show in Files',
        };
    }

    destroy() {
        this._cancellable.cancel();
    }
}

function iconFor(path, isFolder, isProject) {
    if (isProject)
        return Gio.ThemedIcon.new_from_names(['folder-development', 'folder-code', 'folder']);
    if (isFolder)
        return Gio.content_type_get_icon('inode/directory');
    const [type] = Gio.content_type_guess(path, null);
    return Gio.content_type_get_icon(type);
}

function openUri(uri) {
    Gio.AppInfo.launch_default_for_uri_async(uri, global.create_app_launch_context(0, -1), null, null);
}

// Opens the containing folder with the item selected (Files' D-Bus API).
function showInFiles(uri) {
    Gio.DBus.session.call(
        'org.freedesktop.FileManager1', '/org/freedesktop/FileManager1',
        'org.freedesktop.FileManager1', 'ShowItems',
        new GLib.Variant('(ass)', [[uri], '']),
        null, Gio.DBusCallFlags.NONE, -1, null, null);
}
