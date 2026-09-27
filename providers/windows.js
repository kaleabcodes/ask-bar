// Open windows on all workspaces, matched by title and app name.

import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {bestScore} from '../core/fuzzy.js';

// Slightly below apps, so "firefox" lists the app before its windows.
const WEIGHT = 0.9;
const ICON_SIZE = 32;

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
            });
        }
        return results;
    }

    destroy() {}
}
