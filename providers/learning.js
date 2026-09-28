// Remembers which result you pick for what you type (see core/learning.js)
// and persists it to ~/.local/share/ask-bar/history.json. Nothing leaves
// the machine.

import GLib from 'gi://GLib';

import {learnedBonus, recordChoice} from '../core/learning.js';
import {readFile, writeFile} from '../lib/async.js';

const SAVE_DELAY_MS = 2000; // batch writes

export class LearningStore {
    constructor() {
        this._path = `${GLib.get_user_data_dir()}/ask-bar/history.json`;
        this._history = {};
        this._saveId = 0;
        this._load();
    }

    async _load() {
        const text = await readFile(this._path);
        try {
            const data = text ? JSON.parse(text) : {};
            // Keep choices made before loading finished.
            this._history = Object.assign(data && typeof data === 'object' ? data : {}, this._history);
        } catch {
            console.warn('[ask-bar] ignoring unreadable history.json');
        }
    }

    /** @param {string} query  including the mode prefix, e.g. "@readme" */
    record(query, id) {
        recordChoice(this._history, query, id, Date.now());
        this._scheduleSave();
    }

    bonus(query, id) {
        return learnedBonus(this._history, query, id, Date.now());
    }

    clear() {
        this._history = {};
        this._save();
    }

    _scheduleSave() {
        if (this._saveId)
            return;
        this._saveId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SAVE_DELAY_MS, () => {
            this._saveId = 0;
            this._save();
            return GLib.SOURCE_REMOVE;
        });
    }

    _save() {
        writeFile(this._path, JSON.stringify(this._history))
            .catch(e => console.warn(`[ask-bar] couldn't save history: ${e.message}`));
    }

    destroy() {
        if (this._saveId) {
            GLib.source_remove(this._saveId);
            this._saveId = 0;
            this._save(); // flush pending choices
        }
    }
}
