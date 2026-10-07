// Non-blocking helpers. Everything here is async: this code runs inside
// gnome-shell, where blocking I/O freezes the whole desktop.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup';
import St from 'gi://St';

Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async');
Gio._promisify(Gio.File.prototype, 'load_contents_async');
Gio._promisify(Gio.File.prototype, 'read_async');
Gio._promisify(Gio.InputStream.prototype, 'read_bytes_async');
Gio._promisify(Gio.InputStream.prototype, 'close_async');
Gio._promisify(Gio.File.prototype, 'replace_contents_bytes_async', 'replace_contents_finish');
Gio._promisify(Soup.Session.prototype, 'send_and_read_async');

const HTTP_TIMEOUT_S = 10;

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
 * Writes a file atomically, creating its folder if needed.
 *
 * @param {string} path
 * @param {string} text
 * @returns {Promise<void>}
 */
export async function writeFile(path, text) {
    const file = Gio.File.new_for_path(path);
    try {
        file.get_parent().make_directory_with_parents(null);
    } catch (e) {
        if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
            throw e;
    }
    await file.replace_contents_bytes_async(new GLib.Bytes(new TextEncoder().encode(text)),
        null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
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

/**
 * Cryptographically secure random bytes from the kernel.
 *
 * @param {number} count
 * @returns {Promise<Uint8Array>}
 */
export async function randomBytes(count) {
    const stream = await Gio.File.new_for_path('/dev/urandom').read_async(GLib.PRIORITY_DEFAULT, null);
    try {
        const bytes = await stream.read_bytes_async(count, GLib.PRIORITY_DEFAULT, null);
        return bytes.toArray();
    } finally {
        await stream.close_async(GLib.PRIORITY_DEFAULT, null);
    }
}

/**
 * GETs a JSON document.
 *
 * @param {string} url
 * @param {Gio.Cancellable} [cancellable]
 * @returns {Promise<any>}
 * @throws {Error} on network or HTTP errors, or invalid JSON
 */
export async function fetchJson(url, cancellable = null) {
    const session = new Soup.Session({timeout: HTTP_TIMEOUT_S, user_agent: 'ask-bar'});
    const message = Soup.Message.new('GET', url);
    const bytes = await session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, cancellable);
    if (message.get_status() !== Soup.Status.OK)
        throw new Error(`HTTP ${message.get_status()} ${message.get_reason_phrase() ?? ''}`.trim());
    return JSON.parse(new TextDecoder().decode(bytes.toArray()));
}

/**
 * @returns {Promise<string>} clipboard text ('' when empty or not text)
 */
export function readClipboard() {
    return new Promise(resolve => {
        St.Clipboard.get_default().get_text(St.ClipboardType.CLIPBOARD, (_, text) => resolve(text ?? ''));
    });
}

export function isCancelled(e) {
    return e instanceof GLib.Error && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);
}

function cancelledError() {
    return new GLib.Error(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED, 'Cancelled');
}
