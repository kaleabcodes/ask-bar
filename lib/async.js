// Non-blocking helpers. Everything here is async: this code runs inside
// gnome-shell, where blocking I/O freezes the whole desktop.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async');
Gio._promisify(Gio.File.prototype, 'load_contents_async');

/**
 * Runs a command (no shell) and returns stdout. Throws with stderr on failure.
 *
 * @param {string[]} argv
 * @param {Gio.Cancellable} [cancellable]
 * @returns {Promise<string>}
 */
export async function run(argv, cancellable = null) {
    const proc = Gio.Subprocess.new(argv,
        Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
    const [stdout, stderr] = await proc.communicate_utf8_async(null, cancellable);
    if (!proc.get_successful())
        throw new Error(stderr.trim() || `${argv[0]} exited with status ${proc.get_exit_status()}`);
    return stdout;
}

/**
 * @param {string} path
 * @param {Gio.Cancellable} [cancellable]
 * @returns {Promise<string|null>} contents, or null if unreadable
 */
export async function readFile(path, cancellable = null) {
    try {
        const [bytes] = await Gio.File.new_for_path(path).load_contents_async(cancellable);
        return new TextDecoder().decode(bytes);
    } catch (e) {
        if (isCancelled(e))
            throw e;
        return null;
    }
}

/**
 * Resolves after `ms`; rejects with a CANCELLED error if cancelled first,
 * so no timeout outlives a search or the extension.
 *
 * @param {number} ms
 * @param {Gio.Cancellable} cancellable
 * @returns {Promise<void>}
 */
export function sleep(ms, cancellable) {
    return new Promise((resolve, reject) => {
        if (cancellable.is_cancelled()) {
            reject(cancelledError());
            return;
        }
        let cancelId = 0;
        const sourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            cancellable.disconnect(cancelId);
            resolve();
            return GLib.SOURCE_REMOVE;
        });
        cancelId = cancellable.connect(() => {
            GLib.source_remove(sourceId);
            reject(cancelledError());
        });
    });
}

export function isCancelled(e) {
    return e instanceof GLib.Error && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);
}

function cancelledError() {
    return new GLib.Error(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED, 'Cancelled');
}
