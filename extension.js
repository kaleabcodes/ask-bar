import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {MODES} from './core/parse.js';
import {AppsProvider} from './providers/apps.js';
import {CalculatorProvider} from './providers/calculator.js';
import {FilesProvider} from './providers/files.js';
import {WindowsProvider} from './providers/windows.js';
import {AskBar} from './ui/bar.js';

// Modes that are planned but not built yet, shown as a hint row.
const COMING_SOON = {
    [MODES.COMMANDS]: ['Commands', 'utilities-terminal-symbolic'],
    [MODES.WEB]: ['Web search', 'web-browser-symbolic'],
    [MODES.AI]: ['Ask AI', 'starred-symbolic'],
};

export default class AskBarExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._apps = new AppsProvider();
        this._windows = new WindowsProvider();
        this._calculator = new CalculatorProvider();
        this._files = new FilesProvider();

        this._bar = new AskBar({
            search: (parsed, cancellable) => this._search(parsed, cancellable),
            onOpen: () => this._files.prefetch(),
        });
        Main.uiGroup.add_child(this._bar);

        Main.wm.addKeybinding('toggle-shortcut', this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW | Shell.ActionMode.POPUP,
            () => this._bar.toggle());
        Main.overview.connectObject('showing', () => this._bar.close(), this);
    }

    disable() {
        Main.wm.removeKeybinding('toggle-shortcut');
        Main.overview.disconnectObject(this);
        this._bar.close();
        this._bar.destroy();
        this._bar = null;
        for (const provider of [this._apps, this._windows, this._calculator, this._files])
            provider.destroy();
        this._apps = this._windows = this._calculator = this._files = null;
        this._settings = null;
    }

    /**
     * @returns {Result[] | Promise<Result[]>} sync for instant sources; a
     *     Promise for file search
     */
    _search({mode, query}, cancellable) {
        const limit = this._settings.get_int('max-results');
        const top = results => results.sort((a, b) => b.score - a.score).slice(0, limit);

        if (mode === MODES.FILES)
            return this._files.search(query, cancellable).then(top);

        if (COMING_SOON[mode]) {
            const [name, icon] = COMING_SOON[mode];
            return [{
                id: `soon:${mode}`,
                title: `${name} is coming soon`,
                subtitle: 'For now, type without a prefix to search apps and windows',
                kind: '',
                score: 0,
                createIcon: () => new St.Icon({icon_name: icon, icon_size: 32}),
                activate: null,
            }];
        }

        if (mode === MODES.MATH)
            return this._calculator.search(query, {forced: true});

        return top([
            ...this._calculator.search(query),
            ...this._apps.search(query),
            ...this._windows.search(query),
        ]);
    }
}
