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
import {ClipboardHistory} from './providers/clipboard.js';
import {CommandsProvider} from './providers/commands.js';
import {DrivesProvider} from './providers/drives.js';
import {EmojiProvider} from './providers/emoji.js';
import {FilesProvider} from './providers/files.js';
import {FavoritesProvider} from './providers/favorites.js';
import {helpEntry, helpResults} from './providers/help.js';
import {LearningStore} from './providers/learning.js';
import {SettingsPanelsProvider} from './providers/settingsPanels.js';
import {WebProvider} from './providers/web.js';
import {WindowsProvider} from './providers/windows.js';
import {AskBar} from './ui/bar.js';

// In the default search, results scoring under this fraction of the best
// result are dropped as noise.
const RELATIVE_CUTOFF = 0.35;
// "/rank <query>" explains the default-mode ranking of that query.
const RANK_COMMAND = /^rank\s+(.+)$/i;

export default class AskBarExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._actions = new ActionsCatalog(this.path);
        this._learning = new LearningStore();
        this._apps = new AppsProvider(this._actions);
        this._windows = new WindowsProvider();
        this._calculator = new CalculatorProvider(this._settings);
        this._drives = new DrivesProvider(this._settings);
        this._files = new FilesProvider(this._settings, this._actions, this._drives);
        this._web = new WebProvider(this._settings, this.path);
        this._assistants = new AssistantsProvider();
        this._clipboard = new ClipboardHistory(this._settings);
        this._emoji = new EmojiProvider();
        this._panels = new SettingsPanelsProvider();
        this._commands = new CommandsProvider({
            settings: this._settings,
            openPreferences: () => this.openPreferences(),
            excludeFromClipboard: text => this._clipboard.exclude(text),
        });
        this._favorites = new FavoritesProvider(this._settings, item => {
            if (item.id.startsWith('app:'))
                return this._apps.resolveFavorite(item.id);
            if (item.id.startsWith('cmd:'))
                return this._commands.resolveFavorite(item.id);
            if (item.id.startsWith('settings:'))
                return this._panels.resolveFavorite(item.id);
            return this._files.resolveFavorite(item);
        });

        this._bar = new AskBar({
            settings: this._settings,
            search: (parsed, cancellable) => this._search(parsed, cancellable),
            onOpen: () => {
                this._files.prefetch();
                this._drives.refresh();
            },
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
        this._assistants = this._actions = this._learning = this._drives = null;
        this._favorites = this._clipboard = this._emoji = this._panels = null;
        this._settings = null;
    }

    _providers() {
        return [this._apps, this._windows, this._calculator, this._files, this._web, this._commands,
            this._assistants, this._actions, this._learning, this._drives, this._favorites,
            this._clipboard, this._emoji, this._panels];
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
        const top = results => this._favorites.decorate(learn(results).sort((a, b) => b.score - a.score).slice(0, limit));

        switch (mode) {
        case MODES.HELP:
            return helpResults(query);
        case MODES.FILES:
            // Unmounted drives go last: one Enter mounts them.
            return this._files.search(query, cancellable)
                .then(results => [...top(results), ...this._drives.unmounted()]);
        case MODES.COMMANDS: {
            const rank = RANK_COMMAND.exec(query);
            if (rank)
                return this._explainRanking(rank[1].trim(), cancellable);
            // Scores only order matches; keep the provider's order when empty.
            return this._commands.search(query).then(r => (query ? top(r) : this._favorites.decorate(r)));
        }
        case MODES.WEB:
            return this._web.search(query).slice(0, limit);
        case MODES.MATH:
            return this._calculator.search(query, {forced: true, cancellable});
        case MODES.EMOJI:
            // A few extra candidates so learned picks can move up into view.
            return top(this._emoji.search(query, limit + 10));
        case MODES.CLIPBOARD:
            return this._clipboard.search(query, limit);
        case MODES.AI:
            if (!this._assistants.available)
                return [notice('No AI app installed', 'Install Claude or ChatGPT to ask them from here', 'starred-symbolic')];
            return query ? this._assistants.search(query)
                : [notice('Ask AI', 'Type a question to ask an installed AI app', 'starred-symbolic')];
        }

        // Default mode: every enabled source ranked together; the web search
        // fallback always stays last.
        if (!query) {
            const apps = this._settings.get_boolean('search-apps') ? this._apps.search('') : [];
            return [...this._favorites.home(apps, limit), helpEntry()];
        }
        const {instant, pending, fallback} = this._candidates(query, cancellable);
        // With a query, drop matches far weaker than the best one (e.g. an
        // app whose description happens to contain the letters of "readme").
        const rank = results => {
            const sorted = learn(results).sort((a, b) => b.score - a.score);
            const best = sorted[0]?.score ?? 0;
            return this._favorites.decorate(sorted.filter(r => r.score >= best * RELATIVE_CUTOFF).slice(0, limit));
        };
        const rankWithFallback = results => {
            const ranked = rank(results);
            return [...ranked.slice(0, Math.max(0, limit - fallback.length)), ...fallback];
        };

        if (pending.length === 0)
            return rankWithFallback(instant);

        // Files (and exchange rates) are slower: show the instant results
        // first, then re-rank with the rest when they arrive.
        const more = Promise.all(pending).then(lists => rankWithFallback([...instant, ...lists.flat()]));
        return {results: rankWithFallback([...instant]), more};
    }

    /**
     * Every enabled default-mode source for a query.
     *
     * @returns {{instant: Result[], pending: Promise<Result[]>[], fallback: Result[]}}
     *     fallback rows (web search, AI apps) always come last
     */
    _candidates(query, cancellable) {
        const on = key => this._settings.get_boolean(key);
        const web = this._web.fallback(query);
        const calc = on('search-calculator') ? this._calculator.search(query, {cancellable}) : [];
        const instant = [
            ...(Array.isArray(calc) ? calc : []),
            ...(on('search-apps') ? this._apps.search(query) : []),
            ...(on('search-windows') ? this._windows.search(query) : []),
            ...(on('search-settings') ? this._panels.search(query) : []),
            ...(on('search-commands') ? this._commands.searchQuick(query) : []),
            ...web.filter(r => r.score > 0),
        ];
        const pending = [];
        if (calc instanceof Promise)
            pending.push(calc); // currency conversion waiting for rates
        if (on('search-files'))
            pending.push(this._files.searchTop(query, cancellable, this._settings.get_int('default-file-results')));
        // Web search, then "Ask Claude / ChatGPT", always at the end.
        const fallback = [
            ...web.filter(r => r.score <= 0),
            ...(on('ask-ai-apps') ? this._assistants.search(query) : []),
        ];
        return {instant, pending, fallback};
    }

    /**
     * "/rank <query>": every candidate of the default search with its score,
     * learned bonus and whether the cutoff or the result limit hides it.
     * Enter copies the list as text.
     */
    async _explainRanking(query, cancellable) {
        if (!query)
            return [notice('Explain ranking', 'Type a search after /rank to see how its results are scored', 'view-sort-descending-symbolic')];
        const {instant, pending, fallback} = this._candidates(query, cancellable);
        const key = learningKey({prefix: '', query});
        const learning = this._settings.get_boolean('learn-choices');
        const rows = [...instant, ...(await Promise.all(pending)).flat()].map(r => {
            const bonus = learning ? this._learning.bonus(key, r.id) : 0;
            return {r, base: r.score, bonus, total: r.score + bonus};
        }).sort((a, b) => b.total - a.total);
        const best = rows[0]?.total ?? 0;
        const limit = this._settings.get_int('max-results') - fallback.length;
        const lines = [`Ranking for "${query}"`];
        const results = rows.map(({r, base, bonus, total}, i) => {
            const hidden = total < best * RELATIVE_CUTOFF ? `hidden: under ${Math.round(RELATIVE_CUTOFF * 100)}% of the best`
                : i >= limit ? 'hidden: beyond max results' : '';
            const detail = [r.kind || 'Result', bonus ? `${base.toFixed(1)} + learned ${bonus.toFixed(1)}` : '',
                hidden, r.id].filter(Boolean).join('  ·  ');
            lines.push(`${(i + 1).toString().padStart(2)}. ${total.toFixed(1).padStart(7)}  ${r.title}  [${detail}]`);
            return {
                id: `rank:${r.id}`, title: `${total.toFixed(1)}  ${r.title}`, subtitle: detail,
                kind: hidden ? 'Hidden' : `#${i + 1}`, score: total, createIcon: r.createIcon,
                activate: () => St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, lines.join('\n')),
            };
        });
        for (const r of fallback) {
            lines.push(`    fallback  ${r.title}  [${r.id}]`);
            results.push({id: `rank:${r.id}`, title: r.title, subtitle: `Always last  ·  ${r.id}`, kind: 'Fallback',
                score: r.score, createIcon: r.createIcon, activate: null});
        }
        return results.length ? results
            : [notice('No results', `Nothing in the default search matches "${query}"`, 'view-sort-descending-symbolic')];
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
