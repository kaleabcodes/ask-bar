// GNOME Settings panels ("wifi", "bluetooth", "displays") in the default
// search. Each panel ships a hidden .desktop file whose command is
// "gnome-control-center <panel>"; opening it jumps straight to that panel.

import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {bestScore} from '../core/fuzzy.js';

// Just below apps, so "settings" opens the Settings app before a panel.
const WEIGHT = 0.95;
const ICON_SIZE = 32;

export class SettingsPanelsProvider {
    constructor() {
        this._appSystem = Shell.AppSystem.get_default();
        this._entries = null;
        this._appSystem.connectObject('installed-changed', () => {
            this._entries = null;
        }, this);
    }

    /**
     * @param {string} query
     * @returns {import('./types.js').Result[]}
     */
    search(query) {
        if (!query)
            return [];
        const results = [];
        for (const entry of this._getEntries()) {
            // The de-punctuated name counts as much as the name: "wifi" is "Wi-Fi"
            const score = Math.max(bestScore(query, entry.fields) ?? -Infinity, bestScore(query, [entry.plain]) ?? -Infinity);
            if (score !== -Infinity)
                results.push(this._result(entry, score * WEIGHT));
        }
        return results;
    }

    resolveFavorite(id) {
        const entry = this._getEntries().find(e => `settings:${e.info.get_id()}` === id);
        return entry ? this._result(entry, 0) : null;
    }

    _getEntries() {
        if (!this._entries) {
            this._entries = this._appSystem.get_installed()
                .filter(info => /^gnome-control-center\s+\S+/.test(info.get_commandline() ?? '') && !info.should_show())
                .map(info => {
                    const name = info.get_name();
                    return {
                        info,
                        plain: name.replace(/[^\p{L}\p{N}]+/gu, ''),
                        fields: [name, info.get_keywords?.()?.join(' '), info.get_description()],
                    };
                });
        }
        return this._entries;
    }

    _result({info}, score) {
        const id = `settings:${info.get_id()}`;
        return {
            id,
            favorite: {id, title: info.get_name()},
            title: info.get_name(),
            subtitle: info.get_description() || 'GNOME Settings',
            kind: 'Settings',
            score,
            createIcon: () => new St.Icon({
                gicon: info.get_icon() ?? Gio.ThemedIcon.new('preferences-system-symbolic'),
                icon_size: ICON_SIZE,
            }),
            activate: () => {
                const app = this._appSystem.lookup_app(info.get_id());
                if (app)
                    app.activate();
                else
                    info.launch([], global.create_app_launch_context(0, -1));
            },
        };
    }

    destroy() {
        this._appSystem.disconnectObject(this);
    }
}
