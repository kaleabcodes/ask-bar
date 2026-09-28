// "Ask Claude / Ask ChatGPT" rows for installed AI desktop apps: at the end
// of the default search (next to "Search Google") and in "?" mode.
//
// Choosing one opens the app with the question in the link and also copies
// the question, so it can be pasted if the app doesn't prefill it.

import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {ASSISTANTS, matchAssistant} from '../core/assistants.js';

const ICON_SIZE = 32;
const SCORE = -1001; // just below the web search fallback (-1000)

export class AssistantsProvider {
    constructor() {
        this._appSystem = Shell.AppSystem.get_default();
        this._installed = null; // [{app, assistant}], rebuilt when apps change
        this._appSystem.connectObject('installed-changed', () => {
            this._installed = null;
        }, this);
    }

    /** @returns {boolean} whether any supported AI app is installed */
    get available() {
        return this._getInstalled().length > 0;
    }

    /**
     * @param {string} question
     * @returns {import('./types.js').Result[]}
     */
    search(question) {
        if (!question)
            return [];
        return this._getInstalled().map(({app, assistant}, i) => ({
            id: `ai:${assistant.key}`,
            title: `Ask ${assistant.name}: “${question}”`,
            subtitle: `Opens ${app.get_name()} · the question is also copied`,
            kind: 'AI',
            score: SCORE - i,
            createIcon: () => app.create_icon_texture(ICON_SIZE),
            activate: () => ask(app, assistant, question),
        }));
    }

    _getInstalled() {
        if (!this._installed) {
            const seen = new Set();
            this._installed = [];
            for (const info of this._appSystem.get_installed()) {
                const assistant = matchAssistant({id: info.get_id(), executable: info.get_executable()});
                if (!assistant || seen.has(assistant.key))
                    continue;
                const app = this._appSystem.lookup_app(info.get_id());
                if (app) {
                    seen.add(assistant.key);
                    this._installed.push({app, assistant});
                }
            }
            // A fixed order (as listed in ASSISTANTS), not install order.
            this._installed.sort((a, b) => ASSISTANTS.indexOf(a.assistant) - ASSISTANTS.indexOf(b.assistant));
        }
        return this._installed;
    }

    destroy() {
        this._appSystem.disconnectObject(this);
    }
}

function ask(app, assistant, question) {
    St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, question);
    try {
        app.get_app_info().launch_uris([assistant.link(question)], global.create_app_launch_context(0, -1));
    } catch (e) {
        // The app couldn't take the link: open it plainly; the question is
        // on the clipboard.
        app.activate();
        console.warn(`[ask-bar] ${assistant.name} link failed: ${e.message}`);
    }
    Main.osdWindowManager.showOne(Main.layoutManager.currentMonitor.index,
        Gio.ThemedIcon.new('edit-copy-symbolic'), `Asking ${assistant.name} · question copied`, null, -1);
}
