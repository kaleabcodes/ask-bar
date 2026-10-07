// ":" mode: emoji, symbols and kaomoji by name or keyword. Enter copies
// the character.

import Gio from 'gi://Gio';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {searchGlyphs} from '../core/emoji.js';

export class EmojiProvider {
    /**
     * @param {string} query
     * @param {number} limit
     * @returns {import('./types.js').Result[]}
     */
    search(query, limit) {
        return searchGlyphs(query, limit).map(glyph => ({
            id: `emoji:${glyph.char}`,
            title: glyph.name,
            subtitle: glyph.keywords ? glyph.keywords.replace(/ /g, ', ') : '',
            kind: glyph.group,
            score: glyph.score,
            createIcon: () => new St.Label({text: glyph.char, style_class: 'ab-glyph'}),
            activate: () => copy(glyph.char),
        }));
    }

    destroy() {}
}

function copy(text) {
    St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, text);
    Main.osdWindowManager.showOne(Main.layoutManager.currentMonitor.index,
        Gio.ThemedIcon.new('edit-copy-symbolic'), `Copied ${text}`, null, -1);
}
