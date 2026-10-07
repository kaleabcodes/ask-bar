// "/clip" mode: what you copied recently. Enter copies an entry again
// (it moves to the top); Alt+Enter removes it or clears the history.
//
// The history lives only in memory: nothing is written to disk, and it is
// cleared when the extension is disabled or you log out. Copies flagged by
// password managers (x-kde-passwordManagerHint) and Ask Bar's own generated
// passwords are never recorded.

import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {addEntry, describeEntry, removeEntry, searchEntries, summarize} from '../core/clipboard.js';

const ICON_SIZE = 32;
const PASSWORD_HINT = 'x-kde-passwordManagerHint';

export class ClipboardHistory {
    /** @param {Gio.Settings} settings */
    constructor(settings) {
        this._settings = settings;
        this._entries = [];
        this._skip = new Set(); // texts copied by Ask Bar that must not be recorded
        this._selection = global.display.get_selection();
        this._selection.connectObject('owner-changed', (_selection, type, source) => {
            if (type === Meta.SelectionType.SELECTION_CLIPBOARD)
                this._onChanged(source);
        }, this);
    }

    /** Don't record the next copy of this text (generated passwords). */
    exclude(text) {
        this._skip.add(text);
    }

    _onChanged(source) {
        if (!this._settings.get_boolean('clipboard-history'))
            return;
        if (source?.get_mimetypes?.().includes(PASSWORD_HINT))
            return;
        St.Clipboard.get_default().get_text(St.ClipboardType.CLIPBOARD, (_, text) => {
            if (!text || !this._settings)
                return;
            if (this._skip.delete(text))
                return;
            this._entries = addEntry(this._entries, text, Date.now(),
                this._settings.get_int('clipboard-history-size'));
        });
    }

    /**
     * @param {string} query
     * @param {number} limit
     * @returns {import('./types.js').Result[]}
     */
    search(query, limit) {
        if (!this._settings.get_boolean('clipboard-history'))
            return [notice('Clipboard history is off', 'Turn it on in Ask Bar Settings → Search')];
        if (this._entries.length === 0)
            return [notice('Nothing copied yet', 'Text you copy from now on appears here (kept in memory only)')];
        const now = Date.now();
        const found = searchEntries(this._entries, query, limit);
        if (found.length === 0)
            return [notice('No matching clipboard entry', `${this._entries.length} entries · try other words`)];
        return found.map(entry => ({
            id: `clip:${entry.time}`,
            title: summarize(entry.text),
            subtitle: describeEntry(entry, now),
            kind: 'Clipboard',
            score: entry.score,
            createIcon: () => icon('edit-paste-symbolic'),
            activate: () => this._copy(entry.text),
            actions: () => this._actions(entry),
        }));
    }

    _actions(entry) {
        return [{
            id: 'action:copy', title: 'Copy', subtitle: 'Put it back on the clipboard', kind: '', score: 0,
            createIcon: () => icon('edit-copy-symbolic'),
            activate: () => this._copy(entry.text),
        }, {
            id: 'action:remove', title: 'Remove from History', subtitle: summarize(entry.text), kind: '', score: 0,
            createIcon: () => icon('edit-delete-symbolic'),
            keepOpen: true,
            activate: () => {
                this._entries = removeEntry(this._entries, entry.text);
            },
        }, {
            id: 'action:clear', title: 'Clear History', subtitle: `Forget all ${this._entries.length} entries`, kind: '', score: 0,
            createIcon: () => icon('edit-clear-all-symbolic'),
            keepOpen: true,
            activate: () => {
                this._entries = [];
            },
        }];
    }

    _copy(text) {
        St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, text);
        Main.osdWindowManager.showOne(Main.layoutManager.currentMonitor.index,
            Gio.ThemedIcon.new('edit-copy-symbolic'), 'Copied', null, -1);
    }

    destroy() {
        this._selection.disconnectObject(this);
        this._selection = null;
        this._entries = [];
        this._skip.clear();
        this._settings = null;
    }
}

function icon(name) {
    return new St.Icon({icon_name: name, icon_size: ICON_SIZE});
}

function notice(title, subtitle) {
    return {
        id: `notice:${title}`, title, subtitle, kind: '', score: 0,
        createIcon: () => icon('edit-paste-symbolic'),
        activate: null,
    };
}
