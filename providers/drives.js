// Drives for "@" file search.
//
// GNOME's file index doesn't cover other drives (and on some systems won't
// index them even when told to), so Ask Bar keeps its own list of the files
// on each mounted drive: `find` writes it to ~/.cache/ask-bar/drives/ when a
// drive is mounted (and every 10 minutes while the bar is used), and a
// search is a fast `grep` over it. For a 15,000-file drive, building the
// list takes about 30 ms and searching it a few milliseconds.
//
// Also lists drives that aren't mounted, so one Enter mounts them.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as ShellMountOperation from 'resource:///org/gnome/shell/ui/shellMountOperation.js';

import {isCancelled, run} from '../lib/async.js';

const ICON_SIZE = 32;
const UNMOUNTED_SCORE = -500; // after the files
const REFRESH_EVERY_MS = 10 * 60 * 1000;
const GREP_LIMIT = 400;       // candidates per drive; our ranking picks the best

// Folders that are never what you're looking for; skipping them keeps the
// lists small. Hidden folders are skipped too.
const SKIP = ['node_modules', '__pycache__', 'venv', 'lost+found', '$RECYCLE.BIN', 'System Volume Information'];

export class DrivesProvider {
    /** @param {Gio.Settings} settings */
    constructor(settings) {
        this._settings = settings;
        this._monitor = Gio.VolumeMonitor.get();
        this._cacheDir = `${GLib.get_user_cache_dir()}/ask-bar/drives`;
        this._lists = new Map(); // mount root -> {file, builtAt, building}
        this._cancellable = new Gio.Cancellable();

        this._monitor.connectObject(
            'mount-added', (_, mount) => this._build(rootOf(mount)),
            'mount-removed', (_, mount) => this._lists.delete(rootOf(mount)),
            this);
        this.refresh();
    }

    get _enabled() {
        return this._settings.get_boolean('search-drives');
    }

    // Builds missing or stale lists (called when the bar opens).
    refresh() {
        if (!this._enabled)
            return;
        for (const root of this.mountedRoots()) {
            const list = this._lists.get(root);
            if (!list || (!list.building && Date.now() - list.builtAt > REFRESH_EVERY_MS))
                this._build(root);
        }
    }

    /** @returns {string[]} root paths of mounted drives (not the system disk) */
    mountedRoots() {
        return this._monitor.get_mounts().map(rootOf).filter(Boolean);
    }

    /**
     * Paths on mounted drives whose path contains every word of the query.
     *
     * @param {string} query
     * @param {Gio.Cancellable} cancellable
     * @returns {Promise<string[]>}
     */
    async search(query, cancellable) {
        const words = query.toLowerCase().split(/[\s/]+/).filter(Boolean);
        if (!this._enabled || words.length === 0)
            return [];
        // grep for the longest word, then check the others here.
        const term = words.reduce((a, b) => (b.length > a.length ? b : a));
        const roots = this.mountedRoots().filter(root => this._lists.has(root));
        const found = await Promise.all(roots.map(async root => {
            try {
                const out = await run(['grep', '-iF', '-m', `${GREP_LIMIT}`, '--', term,
                    this._lists.get(root).file], cancellable);
                return out.split('\n');
            } catch (e) {
                if (isCancelled(e))
                    throw e;
                return []; // grep exits 1 when nothing matches
            }
        }));
        return found.flat().filter(path => {
            const lower = path.toLowerCase();
            return path && words.every(w => lower.includes(w));
        });
    }

    async _build(root) {
        if (!root || !this._enabled)
            return;
        const file = `${this._cacheDir}/${root.replace(/[^\w.-]+/g, '_')}.txt`;
        const entry = {file, builtAt: 0, building: true};
        this._lists.set(root, entry);
        try {
            GLib.mkdir_with_parents(this._cacheDir, 0o700);
            const skip = SKIP.flatMap(name => ['-o', '-name', name]);
            await run(['find', root, '-xdev', '-mindepth', '1',
                '(', '-name', '.*', ...skip, ')', '-prune', '-o', '-fprint', file], this._cancellable);
            entry.builtAt = Date.now();
        } catch (e) {
            if (!isCancelled(e))
                console.warn(`[ask-bar] couldn't list files on ${root}: ${e.message}`);
            // find reports unreadable folders but still writes the rest.
            entry.builtAt = Date.now();
        } finally {
            entry.building = false;
        }
    }

    /**
     * "Mount <drive>" rows for drives that can be mounted.
     *
     * @returns {import('./types.js').Result[]}
     */
    unmounted() {
        if (!this._enabled)
            return [];
        return this._monitor.get_volumes()
            .filter(v => !v.get_mount() && v.can_mount())
            .map((volume, i) => ({
                id: `drive:${volume.get_uuid() ?? volume.get_name()}`,
                title: `Mount ${volume.get_name()}`,
                subtitle: 'Not mounted · Enter to mount it so its files can be found',
                kind: 'Drive',
                score: UNMOUNTED_SCORE - i,
                createIcon: () => new St.Icon({gicon: volume.get_icon(), icon_size: ICON_SIZE}),
                activate: () => mount(volume),
            }));
    }

    destroy() {
        this._cancellable.cancel();
        this._monitor.disconnectObject(this);
    }
}

// Mounted drives live under /media/<user> or /run/media/<user>; the system
// disk and pseudo-filesystems don't.
function rootOf(mount) {
    const path = mount.get_root()?.get_path();
    return path && /^\/(run\/)?media\/[^/]+\/[^/]+/.test(path) ? path : null;
}

// Uses GNOME's own mount operation, so password prompts look native.
function mount(volume) {
    const operation = new ShellMountOperation.ShellMountOperation(volume);
    volume.mount(Gio.MountMountFlags.NONE, operation.mountOp, null, (_, res) => {
        try {
            volume.mount_finish(res);
            Main.notify(`${volume.get_name()} mounted`, 'Its files are now in @ search');
        } catch (e) {
            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.FAILED_HANDLED))
                Main.notifyError(`Couldn't mount ${volume.get_name()}`, e.message);
        } finally {
            operation.close();
        }
    });
}
