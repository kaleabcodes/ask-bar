import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {MODES} from './core/parse.js';
import {ActionsCatalog} from './providers/actions.js';
import {AppsProvider} from './providers/apps.js';
import {AssistantsProvider} from './providers/assistants.js';
import {CalculatorProvider} from './providers/calculator.js';
import {CommandsProvider} from './providers/commands.js';
import {FilesProvider} from './providers/files.js';
import {LearningStore} from './providers/learning.js';
import {WebProvider} from './providers/web.js';
import {WindowsProvider} from './providers/windows.js';
import {AskBar} from './ui/bar.js';

// In the default search, results scoring under this fraction of the best
// result are dropped as noise.
const RELATIVE_CUTOFF = 0.35;

export default class AskBarExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._actions = new ActionsCatalog(this.path);
        this._learning = new LearningStore();
        this._apps = new AppsProvider(this._actions);
        this._windows = new WindowsProvider();
        this._calculator = new CalculatorProvider();
        this._files = new FilesProvider(this._settings, this._actions);
        this._web = new WebProvider(this._settings, this.path);
        this._assistants = new AssistantsProvider();
        this._commands = new CommandsProvider({
            settings: this._settings,
            openPreferences: () => this.openPreferences(),
        });

        this._bar = new AskBar({
            settings: this._settings,
            search: (parsed, cancellable) => this._search(parsed, cancellable),
            onOpen: () => this._files.prefetch(),
            onActivated: (parsed, result) => {
                if (this._settings.get_boolean('learn-choices'))
                    this._learning.record(learningKey(parsed), result.id);
            },
        });
        // "Forget learned choices" in the settings bumps this counter.
        this._settings.connectObject('changed::clear-learning', () => this._learning.clear(), this);
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
        this._settings.disconnectObject(this);
        this._bar.close();
        this._bar.destroy();
        this._bar = null;
        for (const provider of this._providers())
            provider.destroy();
        this._apps = this._windows = this._calculator = this._files = this._web = this._commands = null;
        this._assistants = this._actions = this._learning = null;
        this._settings = null;
    }

    _providers() {
        return [this._apps, this._windows, this._calculator, this._files, this._web, this._commands,
            this._assistants, this._actions, this._learning];
    }

    /**
     * @returns {Result[] | Promise<Result[]> | {results: Result[], more: Promise<Result[]>}}
     *     sync for instant sources, a Promise for file search, or both for
     *     the default mode (instant results, then with files added)
     */
    _search(parsed, cancellable) {
        const {mode, query} = parsed;
        const limit = this._settings.get_int('max-results');
        // Boosts results you've picked before for this query (see core/learning.js).
        const learn = results => {
            if (query && this._settings.get_boolean('learn-choices')) {
                const key = learningKey(parsed);
                for (const r of results)
                    r.score += this._learning.bonus(key, r.id);
            }
            return results;
        };
        const top = results => learn(results).sort((a, b) => b.score - a.score).slice(0, limit);

        switch (mode) {
        case MODES.FILES:
            return this._files.search(query, cancellable).then(top);
        case MODES.COMMANDS:
            // Scores only order matches; keep the provider's order when empty.
            return this._commands.search(query).then(r => (query ? top(r) : r));
        case MODES.WEB:
            return this._web.search(query).slice(0, limit);
        case MODES.MATH:
            return this._calculator.search(query, {forced: true});
        case MODES.AI:
            if (!this._assistants.available)
                return [notice('No AI app installed', 'Install Claude or ChatGPT to ask them from here', 'starred-symbolic')];
            return query ? this._assistants.search(query)
                : [notice('Ask AI', 'Type a question to ask an installed AI app', 'starred-symbolic')];
        }

        // Default mode: every enabled source ranked together; the web search
        // fallback always stays last.
        const on = key => this._settings.get_boolean(key);
        const web = this._web.fallback(query);
        const instant = [
            ...(on('search-calculator') ? this._calculator.search(query) : []),
            ...(on('search-apps') ? this._apps.search(query) : []),
            ...(on('search-windows') ? this._windows.search(query) : []),
            ...(on('search-commands') ? this._commands.searchQuick(query) : []),
            ...web.filter(r => r.score > 0),
        ];
        // Web search, then "Ask Claude / ChatGPT", always at the end.
        const fallback = [
            ...web.filter(r => r.score <= 0),
            ...(on('ask-ai-apps') ? this._assistants.search(query) : []),
        ];
        // With a query, drop matches far weaker than the best one (e.g. an
        // app whose description happens to contain the letters of "readme").
        const rank = results => {
            const sorted = learn(results).sort((a, b) => b.score - a.score);
            const best = sorted[0]?.score ?? 0;
            return (query ? sorted.filter(r => r.score >= best * RELATIVE_CUTOFF) : sorted).slice(0, limit);
        };
        const rankWithFallback = results => {
            const ranked = rank(results);
            return [...ranked.slice(0, Math.max(0, limit - fallback.length)), ...fallback];
        };

        if (!query || !on('search-files'))
            return rankWithFallback(instant);

        // Files are slower: show the instant results first, then re-rank
        // with the file matches when they arrive.
        const more = this._files.searchTop(query, cancellable, this._settings.get_int('default-file-results'))
            .then(files => rankWithFallback([...instant, ...files]));
        return {results: rankWithFallback([...instant]), more};
    }
}

// What was typed, including the mode prefix, so "@te" and "te" learn separately.
function learningKey({prefix, query}) {
    return `${prefix}${query}`;
}

function notice(title, subtitle, icon) {
    return {
        id: `notice:${title}`,
        title,
        subtitle,
        kind: '',
        score: 0,
        createIcon: () => new St.Icon({icon_name: icon, icon_size: 32}),
        activate: null,
    };
}
