// "!" web shortcuts ("!gh ask-bar"), typed URLs ("github.com") and the
// "Search the web for …" fallback at the end of the default search.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {bestScore} from '../core/fuzzy.js';
import {DEFAULT_BANGS, asUrl, buildUrl, mergeBangs, parseBang} from '../core/web.js';

const ICON_SIZE = 32;
const URL_SCORE = 900;        // a typed URL is almost certainly what you want
const FALLBACK_SCORE = -1000; // always last

export class WebProvider {
    /**
     * @param {Gio.Settings} settings
     * @param {string} extensionPath  for the bundled brand logos
     */
    constructor(settings, extensionPath) {
        this._settings = settings;
        this._logos = loadLogos(`${extensionPath}/icons/brands`);
    }

    // The site's official logo for built-in shortcuts (a custom shortcut
    // reusing a built-in key but another URL gets the generic icon).
    _icon(bang) {
        const builtin = DEFAULT_BANGS.some(d => d.key === bang?.key && d.url === bang?.url);
        const gicon = builtin ? this._logos.get(bang.key) : null;
        return gicon
            ? new St.Icon({gicon, icon_size: ICON_SIZE})
            : new St.Icon({icon_name: 'web-browser-symbolic', icon_size: ICON_SIZE});
    }

    /**
     * "!" mode.
     *
     * @param {string} query  text after "!", e.g. "gh ask bar"
     * @returns {import('./types.js').Result[]}
     */
    search(query) {
        const bangs = this._bangs();
        const {bang, key, terms} = parseBang(query, bangs);

        if (bang && terms)
            return [this._searchResult(bang, terms, 100)];
        if (bang)
            return [this._pickResult(bang, 100)];

        // Unknown or partial key: suggest shortcuts; with more words, offer
        // the default engine for the whole text.
        const picks = bangs
            .map((b, i) => ({b, score: key ? bestScore(key, [b.key, b.name]) : 50 - i}))
            .filter(({score}) => score !== null)
            .sort((a, b) => b.score - a.score)
            .map(({b, score}) => this._pickResult(b, score));
        const engine = this._defaultEngine(bangs);
        if (query.trim() && engine)
            picks.push(this._searchResult(engine, query.trim(), FALLBACK_SCORE));
        return picks;
    }

    /**
     * Default mode: open typed URLs, and end with a web search.
     *
     * @param {string} query
     * @returns {import('./types.js').Result[]}
     */
    fallback(query) {
        if (!query || !this._settings.get_boolean('web-fallback'))
            return [];
        const results = [];
        const url = asUrl(query);
        if (url) {
            results.push({
                id: `url:${url}`,
                title: `Open ${url.replace(/^https?:\/\//, '')}`,
                subtitle: url,
                kind: 'Web',
                score: URL_SCORE,
                createIcon: () => new St.Icon({icon_name: 'web-browser-symbolic', icon_size: ICON_SIZE}),
                activate: () => openUrl(url),
            });
        }
        const engine = this._defaultEngine(this._bangs());
        if (engine)
            results.push(this._searchResult(engine, query, FALLBACK_SCORE));
        return results;
    }

    _bangs() {
        let custom = [];
        try {
            custom = JSON.parse(this._settings.get_string('custom-web-shortcuts'));
        } catch {}
        return mergeBangs(Array.isArray(custom) ? custom : []);
    }

    _defaultEngine(bangs) {
        const key = this._settings.get_string('default-search-engine');
        return bangs.find(b => b.key === key) ?? bangs.find(b => b.key === 'g') ?? null;
    }

    _searchResult(bang, terms, score) {
        const url = buildUrl(bang, terms);
        return {
            id: `web:${bang.key}:${terms}`,
            title: `Search ${bang.name} for “${terms}”`,
            subtitle: `!${bang.key}  ·  ${hostOf(bang.url)}`,
            kind: 'Web',
            score,
            createIcon: () => this._icon(bang),
            activate: () => openUrl(url),
        };
    }

    // A shortcut without terms: Enter or Tab fills "!gh " so you can type.
    _pickResult(bang, score) {
        return {
            id: `bang:${bang.key}`,
            title: bang.name,
            subtitle: `!${bang.key}  ·  ${hostOf(bang.url)}`,
            kind: 'Web',
            score,
            createIcon: () => this._icon(bang),
            activate: null,
            fill: `!${bang.key} `,
        };
    }

    destroy() {}
}

// Maps shortcut keys to logo files: "gh-symbolic.svg" or "yt.svg".
// Symbolic logos (black brands) are recolored to the text color by GNOME.
function loadLogos(dir) {
    const logos = new Map();
    for (const {key} of DEFAULT_BANGS) {
        for (const name of [`${key}.svg`, `${key}-symbolic.svg`]) {
            const path = `${dir}/${name}`;
            if (GLib.file_test(path, GLib.FileTest.EXISTS)) {
                logos.set(key, Gio.FileIcon.new(Gio.File.new_for_path(path)));
                break;
            }
        }
    }
    return logos;
}

function openUrl(url) {
    Gio.AppInfo.launch_default_for_uri_async(url, global.create_app_launch_context(0, -1), null, null);
}

function hostOf(url) {
    return url.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}
