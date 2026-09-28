// The Alt+Enter action list for a file, folder or project: open it in each
// installed code editor or terminal, open it on GitHub/GitLab, copy its
// path, show it in Files. Also app actions ("New Window", …) for apps.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {EDITORS, TERMINALS, editorArgv, matchApp} from '../core/devApps.js';
import {hostLabel, parseHead, parseRemoteUrl, remoteToWeb, webUrlFor} from '../core/gitRemote.js';

const ICON_SIZE = 32;

/**
 * @typedef {import('./types.js').Result} Result
 */

export class ActionsCatalog {
    /** @param {string} extensionPath  for the bundled GitHub logo */
    constructor(extensionPath) {
        this._githubLogo = Gio.FileIcon.new(Gio.File.new_for_path(`${extensionPath}/icons/brands/gh-symbolic.svg`));
        this._appSystem = Shell.AppSystem.get_default();
        this._installed = null; // {editors, terminals}, rebuilt when apps change
        this._appSystem.connectObject('installed-changed', () => {
            this._installed = null;
        }, this);
    }

    /**
     * @param {string} path
     * @param {{isFolder: boolean}} options
     * @returns {Result[]}
     */
    forPath(path, {isFolder}) {
        const uri = Gio.File.new_for_path(path).get_uri();
        const folder = isFolder ? path : GLib.path_get_dirname(path);
        const {editors, terminals} = this._getInstalled();
        const actions = [];

        actions.push(action('open', isFolder ? 'Open in Files' : 'Open', 'Default app',
            symbolic(isFolder ? 'folder-open-symbolic' : 'document-open-symbolic'),
            () => launchUri(uri)));

        for (const {app, entry} of editors) {
            if (entry.filesOnly && isFolder)
                continue;
            actions.push(action(`editor:${entry.key}`, `Open in ${app.get_name()}`, 'Code editor',
                () => app.create_icon_texture(ICON_SIZE), () => openInEditor(app, path)));
        }

        for (const {app, entry} of terminals) {
            actions.push(action(`terminal:${entry.key}`, `Open in ${entry.label}`, `Terminal · ${displayPath(folder)}`,
                () => app.create_icon_texture(ICON_SIZE), () => spawn(entry.argv(folder))));
        }

        const web = repoWebUrl(path, isFolder);
        if (web) {
            const icon = web.label === 'GitHub'
                ? () => new St.Icon({gicon: this._githubLogo, icon_size: ICON_SIZE})
                : symbolic('web-browser-symbolic');
            actions.push(action('web', `Open on ${web.label}`, web.url, icon, () => launchUri(web.url)));
        }

        actions.push(action('copy-path', 'Copy Path', displayPath(path), symbolic('edit-copy-symbolic'),
            () => copy(path, 'Path copied')));
        actions.push(action('show', 'Show in Files', displayPath(folder), symbolic('system-file-manager-symbolic'),
            () => showInFiles(uri)));
        return actions;
    }

    /**
     * The app's own actions from its .desktop file (e.g. "New Private
     * Window"), plus Open.
     *
     * @param {Shell.App} app
     * @returns {Result[]}
     */
    forApp(app) {
        const info = app.get_app_info();
        const actions = [action('open', `Open ${app.get_name()}`, 'Or switch to it if running',
            () => app.create_icon_texture(ICON_SIZE), () => app.activate())];
        for (const name of info?.list_actions() ?? []) {
            actions.push(action(`app:${name}`, info.get_action_name(name), app.get_name(),
                () => app.create_icon_texture(ICON_SIZE),
                () => info.launch_action(name, global.create_app_launch_context(0, -1))));
        }
        return actions;
    }

    _getInstalled() {
        if (!this._installed) {
            const editors = [];
            const terminals = [];
            for (const info of this._appSystem.get_installed()) {
                const id = info.get_id();
                const app = this._appSystem.lookup_app(id);
                if (!app)
                    continue;
                const editor = matchApp(id, EDITORS);
                if (editor)
                    editors.push({app, entry: editor});
                const terminal = matchApp(id, TERMINALS);
                if (terminal)
                    terminals.push({app, entry: terminal});
            }
            // Fixed order, as listed in core/devApps.js.
            editors.sort((a, b) => EDITORS.indexOf(a.entry) - EDITORS.indexOf(b.entry));
            terminals.sort((a, b) => TERMINALS.indexOf(a.entry) - TERMINALS.indexOf(b.entry));
            this._installed = {editors, terminals};
        }
        return this._installed;
    }

    destroy() {
        this._appSystem.disconnectObject(this);
    }
}

function action(key, title, subtitle, createIcon, run) {
    return {
        id: `action:${key}`,
        title,
        subtitle,
        kind: '',
        score: 0,
        createIcon,
        activate: run,
    };
}

function symbolic(iconName) {
    return () => new St.Icon({icon_name: iconName, icon_size: ICON_SIZE});
}

// Runs the editor's own command with a plain path (see editorArgv).
function openInEditor(app, path) {
    const commandline = app.get_app_info().get_commandline();
    try {
        const [, argv] = GLib.shell_parse_argv(commandline);
        spawn(editorArgv(argv, path));
    } catch (e) {
        Main.notifyError(`Couldn't open ${app.get_name()}`, e.message);
    }
}

function spawn(argv) {
    try {
        const launcher = new Gio.SubprocessLauncher({flags: Gio.SubprocessFlags.NONE});
        launcher.spawnv(argv);
    } catch (e) {
        Main.notifyError(`Couldn't run ${argv[0]}`, e.message);
    }
}

function launchUri(uri) {
    Gio.AppInfo.launch_default_for_uri_async(uri, global.create_app_launch_context(0, -1), null, null);
}

function showInFiles(uri) {
    Gio.DBus.session.call('org.freedesktop.FileManager1', '/org/freedesktop/FileManager1',
        'org.freedesktop.FileManager1', 'ShowItems', new GLib.Variant('(ass)', [[uri], '']),
        null, Gio.DBusCallFlags.NONE, -1, null, null);
}

function copy(text, message) {
    St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, text);
    Main.osdWindowManager.showOne(Main.layoutManager.currentMonitor.index,
        Gio.ThemedIcon.new('edit-copy-symbolic'), message, null, -1);
}

function displayPath(path) {
    const home = GLib.get_home_dir();
    return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

/**
 * The web page for a path inside a git repository with a known host.
 * Reads .git/config and .git/HEAD of the nearest repository (small files,
 * read only when the action list opens).
 *
 * @returns {{label: string, url: string}|null}
 */
function repoWebUrl(path, isFolder) {
    const home = GLib.get_home_dir();
    for (let dir = isFolder ? path : GLib.path_get_dirname(path); dir.length > 1 && dir !== home;
        dir = GLib.path_get_dirname(dir)) {
        if (!GLib.file_test(`${dir}/.git`, GLib.FileTest.IS_DIR))
            continue;
        const config = readSmall(`${dir}/.git/config`);
        const remote = config && remoteToWeb(parseRemoteUrl(config) ?? '');
        if (!remote)
            return null;
        const branch = parseHead(readSmall(`${dir}/.git/HEAD`) ?? '');
        const relative = path === dir ? '' : path.slice(dir.length + 1);
        return {label: hostLabel(remote.host), url: webUrlFor(remote, branch, relative, isFolder)};
    }
    return null;
}

function readSmall(path) {
    try {
        const [ok, bytes] = GLib.file_get_contents(path);
        return ok ? new TextDecoder().decode(bytes) : null;
    } catch {
        return null;
    }
}
