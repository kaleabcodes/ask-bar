// Installed applications, ranked by fuzzy match on name, generic name,
// keywords and executable. With an empty query, shows the most used apps.

import Shell from 'gi://Shell';

import {bestScore} from '../core/fuzzy.js';

const RUNNING_BONUS = 15;
// Frequently used apps win ties: the most used gets this bonus, fading
// out over the top USAGE_RANKS apps.
const USAGE_BONUS = 12;
const USAGE_RANKS = 30;
const ICON_SIZE = 32;

export class AppsProvider {
    /** @param {import('./actions.js').ActionsCatalog} actions  Alt+Enter actions */
    constructor(actions) {
        this._actions = actions;
        this._appSystem = Shell.AppSystem.get_default();
        this._entries = null; // cached search fields, rebuilt when apps change
        this._appSystem.connectObject('installed-changed', () => {
            this._entries = null;
        }, this);
    }

    /**
     * @param {string} query
     * @returns {import('./types.js').Result[]}
     */
    search(query) {
        if (!query) {
            return Shell.AppUsage.get_default().get_most_used()
                .filter(app => app.get_app_info()?.should_show())
                .map((app, i) => this._result(app, 100 - i));
        }

        const usageRank = new Map(Shell.AppUsage.get_default().get_most_used()
            .slice(0, USAGE_RANKS).map((app, i) => [app.get_id(), i]));

        const results = [];
        for (const {app, fields} of this._getEntries()) {
            let score = bestScore(query, fields);
            if (score === null)
                continue;
            if (app.state === Shell.AppState.RUNNING)
                score += RUNNING_BONUS;
            const rank = usageRank.get(app.get_id());
            if (rank !== undefined)
                score += USAGE_BONUS * (1 - rank / USAGE_RANKS);
            results.push(this._result(app, score));
        }
        return results;
    }

    resolveFavorite(id) {
        const app = this._appSystem.lookup_app(id.slice(4));
        return app ? this._result(app, 0) : null;
    }

    _getEntries() {
        if (!this._entries) {
            this._entries = this._appSystem.get_installed()
                .filter(info => info.should_show())
                .map(info => this._appSystem.lookup_app(info.get_id()))
                .filter(Boolean)
                .map(app => {
                    const info = app.get_app_info();
                    return {
                        app,
                        fields: [
                            app.get_name(),
                            info.get_generic_name?.(),
                            info.get_keywords?.()?.join(' '),
                            info.get_executable(),
                        ],
                    };
                });
        }
        return this._entries;
    }

    _result(app, score) {
        const info = app.get_app_info();
        return {
            id: `app:${app.get_id()}`,
            favorite: {id: `app:${app.get_id()}`, title: app.get_name()},
            title: app.get_name(),
            subtitle: info?.get_description() || info?.get_generic_name?.() || '',
            kind: app.state === Shell.AppState.RUNNING ? 'Running' : 'Application',
            score,
            createIcon: () => app.create_icon_texture(ICON_SIZE),
            activate: () => app.activate(),
            actions: () => this._actions.forApp(app),
        };
    }

    destroy() {
        this._appSystem.disconnectObject(this);
    }
}
