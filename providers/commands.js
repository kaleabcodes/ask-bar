// "/" commands: system actions, developer tools and your own shell commands.
//
// Developer tools work on the text typed after the command ("/b64 hello")
// or, if nothing is typed, on the clipboard. Their result is previewed in
// the subtitle and copied on Enter.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {
    CASES, base64Decode, base64Encode, convertTimestamp, countText, decodeJwt,
    formatJson, minifyJson, password, urlDecode, urlEncode, uuidV4,
} from '../core/devtools.js';
import {bestScore} from '../core/fuzzy.js';
import {randomBytes, readClipboard, run} from '../lib/async.js';

const ICON_SIZE = 32;
const MAX_INPUT = 1024 * 1024;   // ignore huge clipboards, so the bar never stalls
const PREVIEW_LENGTH = 90;
const PREVIEW_COUNT = 6;         // only compute previews for the top matches
const QUICK_WEIGHT = 0.85;       // system commands in the default mode rank below apps
const PASSWORD_LENGTH = 20;
const RELATIVE_CUTOFF = 0.5;     // drop matches scoring under half the best

/**
 * @typedef {object} Command
 * @property {string} name        what you type after "/"
 * @property {string} title
 * @property {string} keywords
 * @property {string} icon
 * @property {'System'|'Developer'|'Custom'} kind
 * @property {string} [description]                   subtitle when there's no preview
 * @property {(input: string, ctx: object) => Promise<{output: string, detail?: string}>} [transform]
 * @property {'arg'|'arg-or-clipboard'} [input]       where a transform's text comes from
 * @property {() => void} [run]                       for actions
 */

export class CommandsProvider {
    /**
     * @param {object} params
     * @param {Gio.Settings} params.settings
     * @param {() => void} params.openPreferences
     */
    constructor({settings, openPreferences}) {
        this._settings = settings;
        this._builtins = [...systemCommands(openPreferences), ...devCommands()];
    }

    /**
     * Full "/" mode: all commands, with previews for developer tools.
     *
     * @param {string} query  e.g. "json", "b64 hello"
     * @returns {Promise<import('./types.js').Result[]>}
     */
    async search(query) {
        const [name, ...rest] = query.split(/\s+/);
        const arg = rest.join(' ');
        const matches = this._match(name ?? '');

        const needsClipboard = matches.slice(0, PREVIEW_COUNT)
            .some(({command}) => command.input === 'arg-or-clipboard' && !arg);
        const clipboard = needsClipboard ? (await readClipboard()).slice(0, MAX_INPUT) : '';
        const ctx = {now: Date.now()};

        return Promise.all(matches.map(async ({command, score}, i) => {
            if (!command.transform)
                return this._actionResult(command, score);
            if (i >= PREVIEW_COUNT)
                return this._toolResult(command, score, null);

            const input = arg || (command.input === 'arg-or-clipboard' ? clipboard : '');
            // Errors about clipboard text say so; typed or empty input doesn't need it.
            const source = !arg && input ? 'clipboard' : '';
            try {
                const preview = await command.transform(input, {...ctx, typed: Boolean(arg)});
                return this._toolResult(command, score, preview, source);
            } catch (e) {
                return this._toolResult(command, score, {error: e.message}, source);
            }
        }));
    }

    /**
     * Default mode ("lock", "dark"): system and custom commands only, sync.
     *
     * @param {string} query
     * @returns {import('./types.js').Result[]}
     */
    searchQuick(query) {
        if (!query)
            return [];
        return this._match(query)
            .filter(({command}) => !command.transform)
            .map(({command, score}) => this._actionResult(command, score * QUICK_WEIGHT));
    }

    _commands() {
        return [...this._builtins, ...customCommands(this._settings)];
    }

    _match(name) {
        const results = [];
        for (const command of this._commands()) {
            const score = name ? bestScore(name, [command.name, command.title, command.keywords]) : 0;
            if (score !== null)
                results.push({command, score});
        }
        // With no query, keep the built-in order (system first, then tools).
        if (!name)
            return results;
        // Short names like "ts" match many commands loosely ("Take
        // Screenshot"); keep only matches reasonably close to the best one.
        results.sort((a, b) => b.score - a.score);
        const best = results[0]?.score ?? 0;
        return results.filter(r => r.score >= best * RELATIVE_CUTOFF);
    }

    _actionResult(command, score) {
        return {
            id: `cmd:${command.name}`,
            title: command.title,
            subtitle: command.description ?? `/${command.name}`,
            kind: command.kind,
            score,
            createIcon: () => commandIcon(command.icon),
            activate: () => command.run(),
        };
    }

    /**
     * @param {Command} command
     * @param {number} score
     * @param {{output?: string, detail?: string, error?: string}|null} preview
     * @param {string} [source]  "clipboard" when the input came from it
     */
    _toolResult(command, score, preview, source = '') {
        let subtitle = command.description ?? `/${command.name}`;
        if (preview?.error)
            subtitle = source ? `Clipboard: ${preview.error}` : preview.error;
        else if (preview?.output !== undefined)
            subtitle = `→ ${oneLine(preview.output)}${preview.detail ? `  ·  ${preview.detail}` : ''}`;

        const canCopy = preview?.output !== undefined;
        return {
            id: `cmd:${command.name}`,
            title: command.title,
            subtitle,
            kind: command.kind,
            score,
            createIcon: () => commandIcon(command.icon),
            activate: canCopy ? () => copy(preview.output, command.title) : null,
        };
    }

    destroy() {}
}

// ── Built-in commands ────────────────────────────────────────────────

function systemCommands(openPreferences) {
    const interfaceSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
    const notifications = new Gio.Settings({schema_id: 'org.gnome.desktop.notifications'});
    const color = new Gio.Settings({schema_id: 'org.gnome.settings-daemon.plugins.color'});

    return [
        {
            name: 'lock', title: 'Lock Screen', keywords: 'lock away', icon: 'system-lock-screen-symbolic',
            kind: 'System', run: () => Main.screenShield.lock(true),
        },
        {
            name: 'suspend', title: 'Suspend', keywords: 'sleep suspend', icon: 'weather-clear-night-symbolic',
            kind: 'System', run: () => callLogind('Suspend'),
        },
        {
            name: 'logout', title: 'Log Out…', keywords: 'log out sign out session', icon: 'system-log-out-symbolic',
            kind: 'System', description: 'Asks for confirmation',
            run: () => callSessionManager('Logout', new GLib.Variant('(u)', [0])),
        },
        {
            name: 'restart', title: 'Restart…', keywords: 'restart reboot', icon: 'system-reboot-symbolic',
            kind: 'System', description: 'Asks for confirmation', run: () => callSessionManager('Reboot'),
        },
        {
            name: 'shutdown', title: 'Power Off…', keywords: 'power off shut down shutdown', icon: 'system-shutdown-symbolic',
            kind: 'System', description: 'Asks for confirmation', run: () => callSessionManager('Shutdown'),
        },
        {
            name: 'dark', title: 'Toggle Dark Mode', keywords: 'dark light theme appearance', icon: 'dark-mode-symbolic',
            kind: 'System',
            get description() {
                return `Currently ${interfaceSettings.get_string('color-scheme') === 'prefer-dark' ? 'dark' : 'light'}`;
            },
            run: () => {
                const dark = interfaceSettings.get_string('color-scheme') === 'prefer-dark';
                interfaceSettings.set_string('color-scheme', dark ? 'default' : 'prefer-dark');
            },
        },
        {
            name: 'nightlight', title: 'Toggle Night Light', keywords: 'night light blue warm', icon: 'night-light-symbolic',
            kind: 'System',
            get description() {
                return `Currently ${color.get_boolean('night-light-enabled') ? 'on' : 'off'}`;
            },
            run: () => color.set_boolean('night-light-enabled', !color.get_boolean('night-light-enabled')),
        },
        {
            name: 'dnd', title: 'Toggle Do Not Disturb', keywords: 'do not disturb notifications quiet focus',
            icon: 'notifications-disabled-symbolic', kind: 'System',
            get description() {
                return `Currently ${notifications.get_boolean('show-banners') ? 'off' : 'on'}`;
            },
            run: () => notifications.set_boolean('show-banners', !notifications.get_boolean('show-banners')),
        },
        {
            name: 'screenshot', title: 'Take Screenshot', keywords: 'screenshot capture screen record',
            icon: 'screenshot-recorded-symbolic', kind: 'System', run: () => Main.screenshotUI.open(),
        },
        {
            name: 'settings', title: 'Open Settings', keywords: 'settings control center preferences',
            icon: 'preferences-system-symbolic', kind: 'System',
            run: () => Shell.AppSystem.get_default().lookup_app('org.gnome.Settings.desktop')?.activate(),
        },
        {
            name: 'askbar', title: 'Ask Bar Settings', keywords: 'ask bar preferences shortcut custom commands',
            icon: 'preferences-other-symbolic', kind: 'System', run: openPreferences,
        },
    ];
}

function devCommands() {
    const tool = (name, title, keywords, icon, transform, extra = {}) =>
        ({name, title, keywords, icon, kind: 'Developer', input: 'arg-or-clipboard', transform, ...extra});
    const sync = fn => input => {
        if (!input)
            throw new Error('Copy some text, or type it after the command');
        return Promise.resolve({output: fn(input)});
    };
    const hash = type => sync(text => GLib.compute_checksum_for_string(type, text, -1));

    return [
        tool('json', 'Format JSON', 'json pretty format beautify', 'text-x-generic-symbolic', sync(formatJson)),
        tool('jsonmin', 'Minify JSON', 'json minify compact', 'text-x-generic-symbolic', sync(minifyJson)),
        tool('jwt', 'Decode JWT', 'jwt token decode bearer', 'dialog-password-symbolic', (input, {now}) => {
            if (!input)
                throw new Error('Copy a JWT, or type it after the command');
            const {payload, summary} = decodeJwt(input, now);
            return Promise.resolve({output: JSON.stringify(payload, null, 2), detail: summary});
        }),
        tool('b64', 'Base64 Encode', 'base64 encode', 'insert-text-symbolic', sync(base64Encode)),
        tool('b64d', 'Base64 Decode', 'base64 decode', 'insert-text-symbolic', sync(base64Decode)),
        tool('url', 'URL Encode', 'url encode percent escape', 'insert-link-symbolic', sync(urlEncode)),
        tool('urld', 'URL Decode', 'url decode percent unescape', 'insert-link-symbolic', sync(urlDecode)),
        tool('ts', 'Timestamp', 'timestamp unix epoch date time now', 'preferences-system-time-symbolic',
            (input, {now, typed}) => {
                try {
                    return Promise.resolve(convertTimestamp(input, now));
                } catch (e) {
                    // Typed input must be valid; with an unrelated clipboard, show "now".
                    if (typed)
                        throw e;
                    return Promise.resolve({output: String(Math.floor(now / 1000)), detail: 'current Unix time'});
                }
            }),
        tool('uuid', 'Generate UUID', 'uuid guid random id', 'view-refresh-symbolic',
            async () => ({output: uuidV4(await randomBytes(16))}), {input: 'arg'}),
        tool('password', 'Generate Password', 'password random secret', 'dialog-password-symbolic',
            async () => ({output: password(await randomBytes(128), PASSWORD_LENGTH)}), {input: 'arg'}),
        tool('sha256', 'SHA-256 Hash', 'sha256 hash checksum', 'security-high-symbolic', hash(GLib.ChecksumType.SHA256)),
        tool('sha1', 'SHA-1 Hash', 'sha1 hash checksum', 'security-medium-symbolic', hash(GLib.ChecksumType.SHA1)),
        tool('md5', 'MD5 Hash', 'md5 hash checksum', 'security-low-symbolic', hash(GLib.ChecksumType.MD5)),
        ...Object.entries(CASES).map(([name, fn]) =>
            tool(name, `${name.charAt(0).toUpperCase()}${name.slice(1)} Case`, `${name} case convert`,
                'format-text-rich-symbolic', sync(fn))),
        tool('count', 'Count Text', 'count characters words lines length', 'view-list-symbolic',
            input => Promise.resolve({output: countText(input)})),
    ];
}

// Your own commands from the settings: [{"name": "...", "command": "..."}].
function customCommands(settings) {
    let list = [];
    try {
        list = JSON.parse(settings.get_string('custom-commands'));
    } catch {
        return [];
    }
    return list.filter(c => c?.name && c?.command).map(c => ({
        name: c.name.toLowerCase().replace(/\s+/g, '-'),
        title: c.name,
        keywords: c.command,
        icon: 'utilities-terminal-symbolic',
        kind: 'Custom',
        description: c.command,
        run: () => runCustom(c),
    }));
}

async function runCustom({name, command}) {
    try {
        await run(['sh', '-c', command]);
    } catch (e) {
        Main.notifyError(`Ask Bar: “${name}” failed`, e.message);
    }
}

// ── Helpers ──────────────────────────────────────────────────────────

// Falls back to a generic icon when the theme lacks the named one.
function commandIcon(name) {
    return new St.Icon({
        gicon: Gio.ThemedIcon.new_from_names([name, 'application-x-executable-symbolic']),
        icon_size: ICON_SIZE,
    });
}

function copy(text, what) {
    St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, text);
    Main.osdWindowManager.showOne(Main.layoutManager.currentMonitor.index,
        Gio.ThemedIcon.new('edit-copy-symbolic'), `Copied · ${what}`, null, -1);
}

function oneLine(text) {
    const flat = text.replace(/\s+/g, ' ').trim();
    return flat.length > PREVIEW_LENGTH ? `${flat.slice(0, PREVIEW_LENGTH)}…` : flat;
}

function callLogind(method) {
    Gio.DBus.system.call('org.freedesktop.login1', '/org/freedesktop/login1',
        'org.freedesktop.login1.Manager', method, new GLib.Variant('(b)', [true]),
        null, Gio.DBusCallFlags.NONE, -1, null, null);
}

// These open GNOME's own confirmation dialog.
function callSessionManager(method, params = null) {
    Gio.DBus.session.call('org.gnome.SessionManager', '/org/gnome/SessionManager',
        'org.gnome.SessionManager', method, params,
        null, Gio.DBusCallFlags.NONE, -1, null, null);
}
