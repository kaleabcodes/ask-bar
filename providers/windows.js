// Open windows on all workspaces, matched by title and app name. Alt+Enter
// offers window actions: close, minimize, maximize, always on top, move to
// another workspace or monitor.

import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {bestScore} from '../core/fuzzy.js';

// Slightly below apps, so "firefox" lists the app before its windows.
const WEIGHT = 0.9;
const ICON_SIZE = 32;
// Mutter 49 dropped the MaximizeFlags argument of Meta.Window.maximize().
const MAXIMIZE_TAKES_FLAGS = Number.parseInt(Config.PACKAGE_VERSION) < 49;

export class WindowsProvider {
    /**
     * @param {string} query
     * @returns {import('./types.js').Result[]}
     */
    search(query) {
        if (!query)
            return [];

        const tracker = Shell.WindowTracker.get_default();
        const results = [];
        for (const win of global.display.get_tab_list(Meta.TabList.NORMAL_ALL, null)) {
            const app = tracker.get_window_app(win);
            const title = win.get_title() ?? '';
            const score = bestScore(query, [title, app?.get_name()]);
            if (score === null)
                continue;

            const workspace = win.get_workspace();
            results.push({
                id: `window:${win.get_id()}`,
                title,
                subtitle: [app?.get_name(), workspace ? `Workspace ${workspace.index() + 1}` : null]
                    .filter(Boolean).join(' · '),
                kind: 'Window',
                score: score * WEIGHT,
                createIcon: () => app?.create_icon_texture(ICON_SIZE) ??
                    new St.Icon({icon_name: 'focus-windows-symbolic', icon_size: ICON_SIZE}),
                activate: () => Main.activateWindow(win),
                actions: () => windowActions(win, app),
            });
        }
        return results;
    }

    destroy() {}
}

/**
 * @param {Meta.Window} win
 * @param {Shell.App|null} app
 * @returns {import('./types.js').Result[]}
 */
function windowActions(win, app) {
    const actions = [];
    const add = (key, title, subtitle, iconName, run) => actions.push({
        id: `action:${key}`, title, subtitle, kind: '', score: 0,
        createIcon: () => new St.Icon({icon_name: iconName, icon_size: ICON_SIZE}),
        activate: run,
    });

    add('switch', 'Switch to Window', app?.get_name() ?? '', 'focus-windows-symbolic', () => Main.activateWindow(win));
    if (win.can_close())
        add('close', 'Close Window', 'Asks to save if needed', 'window-close-symbolic', () => win.delete(global.get_current_time()));
    if (win.can_minimize())
        add('minimize', 'Minimize', 'Hide the window', 'window-minimize-symbolic', () => win.minimize());
    if (win.can_maximize()) {
        if (isMaximized(win))
            add('unmaximize', 'Restore Size', 'Unmaximize the window', 'window-restore-symbolic', () => win.unmaximize(...(MAXIMIZE_TAKES_FLAGS ? [Meta.MaximizeFlags.BOTH] : [])));
        else
            add('maximize', 'Maximize', 'Fill the screen', 'window-maximize-symbolic', () => win.maximize(...(MAXIMIZE_TAKES_FLAGS ? [Meta.MaximizeFlags.BOTH] : [])));
    }
    if (win.is_above())
        add('unabove', 'Stop Keeping on Top', 'Let other windows cover it', 'view-pin-symbolic', () => win.unmake_above());
    else
        add('above', 'Always on Top', 'Keep above other windows', 'view-pin-symbolic', () => win.make_above());

    const manager = global.workspace_manager;
    const current = win.get_workspace()?.index() ?? -1;
    const count = manager.get_n_workspaces();
    for (let i = 0; i < count; i++) {
        if (i === current || win.is_always_on_all_workspaces())
            continue;
        const name = Meta.prefs_get_workspace_name(i) || `Workspace ${i + 1}`;
        add(`workspace:${i}`, `Move to ${name}`, 'And switch to it', 'video-display-symbolic', () => {
            win.change_workspace_by_index(i, false);
            manager.get_workspace_by_index(i)?.activate_with_focus(win, global.get_current_time());
        });
    }
    // With dynamic workspaces, moving past the last one creates a new one.
    if (!win.is_always_on_all_workspaces() && Meta.prefs_get_dynamic_workspaces())
        add('workspace:new', 'Move to New Workspace', 'Create one at the end', 'list-add-symbolic', () => {
            win.change_workspace_by_index(count, true);
            manager.get_workspace_by_index(count)?.activate_with_focus(win, global.get_current_time());
        });

    const monitors = Main.layoutManager.monitors;
    if (monitors.length > 1) {
        for (const monitor of monitors) {
            if (monitor.index === win.get_monitor())
                continue;
            add(`monitor:${monitor.index}`, `Move to Monitor ${monitor.index + 1}`,
                `${monitor.width}×${monitor.height}${monitor.index === Main.layoutManager.primaryIndex ? ' · Primary' : ''}`,
                'video-display-symbolic', () => win.move_to_monitor(monitor.index));
        }
    }
    return actions;
}

function isMaximized(win) {
    if (typeof win.is_maximized === 'function')
        return win.is_maximized();
    return win.get_maximized?.() === Meta.MaximizeFlags.BOTH;
}
