// The Ask Bar overlay: a full-screen transparent backdrop (click outside to
// close) holding a centered panel with the input, results and key hints.
//
// While open it holds a modal grab, so all keyboard input comes here.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {ensureActorVisibleInScrollView} from 'resource:///org/gnome/shell/misc/animationUtils.js';

import {MODES, parse} from '../core/parse.js';
import {isCancelled} from '../lib/async.js';
import {ResultRow} from './resultRow.js';

const PANEL_WIDTH = 680;
const TOP_FRACTION = 0.18; // panel's top edge, as a fraction of the monitor height
const ANIMATION_MS = 120;

const MODE_INFO = {
    [MODES.ALL]: {icon: 'system-search-symbolic', chip: null},
    [MODES.FILES]: {icon: 'folder-symbolic', chip: 'Files'},
    [MODES.COMMANDS]: {icon: 'utilities-terminal-symbolic', chip: 'Commands'},
    [MODES.MATH]: {icon: 'accessories-calculator-symbolic', chip: 'Math'},
    [MODES.WEB]: {icon: 'web-browser-symbolic', chip: 'Web'},
    [MODES.AI]: {icon: 'starred-symbolic', chip: 'Ask AI'},
};

export const AskBar = GObject.registerClass(
class AskBar extends St.Widget {
    /**
     * @param {object} params
     * @param {(parsed: ReturnType<typeof parse>, cancellable: Gio.Cancellable) =>
     *     Result[] | Promise<Result[]>} params.search
     *     Sync for instant sources, a Promise for slow ones (files); the
     *     cancellable is cancelled as soon as the query changes.
     * @param {() => void} [params.onOpen]  e.g. to warm caches
     */
    _init({search, onOpen = () => {}}) {
        super._init({
            style_class: 'ab-backdrop',
            reactive: true,
            visible: false,
        });
        this.add_constraint(new Clutter.BindConstraint({
            source: global.stage,
            coordinate: Clutter.BindCoordinate.ALL,
        }));
        this._search = search;
        this._onOpen = onOpen;
        this._grab = null;
        this._cancellable = null;   // for the in-flight async search
        this._generation = 0;       // ignores results of superseded searches
        this._resultsMode = null;
        this._results = [];
        this._rows = [];
        this._selected = 0;

        this._panel = new St.BoxLayout({
            style_class: 'ab-panel',
            orientation: Clutter.Orientation.VERTICAL,
            reactive: true,
        });
        this.add_child(this._panel);

        const inputRow = new St.BoxLayout({style_class: 'ab-input-row'});
        this._modeIcon = new St.Icon({style_class: 'ab-mode-icon', y_align: Clutter.ActorAlign.CENTER});
        this._chip = new St.Label({style_class: 'ab-chip', visible: false, y_align: Clutter.ActorAlign.CENTER});
        this._entry = new St.Entry({
            style_class: 'ab-entry',
            hint_text: 'Ask anything, @ files, / commands, = math',
            can_focus: true,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        inputRow.add_child(this._modeIcon);
        inputRow.add_child(this._chip);
        inputRow.add_child(this._entry);
        this._panel.add_child(inputRow);

        this._list = new St.BoxLayout({style_class: 'ab-results', orientation: Clutter.Orientation.VERTICAL});
        this._scroll = new St.ScrollView({
            style_class: 'ab-scroll',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            overlay_scrollbars: true,
        });
        this._scroll.set_child(this._list);
        this._panel.add_child(this._scroll);

        const footer = new St.BoxLayout({style_class: 'ab-footer'});
        for (const [key, action] of [['↑↓', 'Navigate'], ['Enter', 'Open'], ['Esc', 'Close']])
            addHint(footer, key, action);
        // Shown when the selected result has a Ctrl+Enter action.
        this._altHint = new St.BoxLayout({visible: false});
        this._altHintLabel = addHint(this._altHint, 'Ctrl+Enter', '');
        footer.add_child(this._altHint);
        this._panel.add_child(footer);

        this._entry.clutter_text.connect('text-changed', () => this._update());
        this._entry.clutter_text.connect('key-press-event', (_, event) => this._onKeyPress(event));
    }

    get isOpen() {
        return this._grab !== null;
    }

    toggle() {
        if (this.isOpen)
            this.close();
        else
            this.open();
    }

    open() {
        if (this.isOpen)
            return;

        this._grab = Main.pushModal(this, {actionMode: Shell.ActionMode.POPUP});

        this.get_parent()?.set_child_above_sibling(this, null);
        this._placePanel();
        this._onOpen();
        this._entry.text = '';
        this._update();
        this.show();
        this._entry.grab_key_focus();

        this._panel.remove_all_transitions();
        this._panel.opacity = 0;
        this._panel.scale_x = this._panel.scale_y = 0.97;
        this._panel.ease({
            opacity: 255,
            scale_x: 1,
            scale_y: 1,
            duration: ANIMATION_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    close() {
        if (!this.isOpen)
            return;
        Main.popModal(this._grab);
        this._grab = null;
        this._cancelSearch();
        this.hide();
        this._setResults([], null);
    }

    // Centered horizontally on the monitor with the pointer, near the top.
    _placePanel() {
        const monitor = Main.layoutManager.currentMonitor;
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const width = Math.min(PANEL_WIDTH * scale, monitor.width * 0.9);
        this._panel.width = width;
        this._panel.set_pivot_point(0.5, 0);
        this._panel.set_position(
            Math.round(monitor.x + (monitor.width - width) / 2),
            Math.round(monitor.y + monitor.height * TOP_FRACTION));
    }

    _update() {
        const parsed = parse(this._entry.text);
        const info = MODE_INFO[parsed.mode];
        this._modeIcon.icon_name = info.icon;
        this._chip.visible = info.chip !== null;
        this._chip.text = info.chip ?? '';

        this._cancelSearch();
        const generation = ++this._generation;
        this._cancellable = new Gio.Cancellable();
        const results = this._search(parsed, this._cancellable);
        if (!(results instanceof Promise)) {
            this._setResults(results, parsed.mode);
            return;
        }

        // Keep showing the previous results of the same mode while the new
        // ones load (no flicker while typing); otherwise say we're searching.
        if (this._resultsMode !== parsed.mode)
            this._setResults([searchingRow(info.icon)], parsed.mode);
        results.then(found => {
            if (generation === this._generation)
                this._setResults(found, parsed.mode);
        }).catch(e => {
            if (!isCancelled(e) && generation === this._generation)
                this._setResults([errorRow(e.message)], parsed.mode);
        });
    }

    _cancelSearch() {
        this._cancellable?.cancel();
        this._cancellable = null;
    }

    _setResults(results, mode) {
        this._resultsMode = mode;
        // Keep the same result selected when the list updates while typing.
        const selectedId = this._results[this._selected]?.id;
        this._results = results;
        this._list.destroy_all_children();
        this._rows = results.map((result, index) => {
            const row = new ResultRow(result);
            row.connect('notify::hover', () => {
                if (row.hover)
                    this._select(index, false);
            });
            row.connect('clicked', () => this._activate(index));
            this._list.add_child(row);
            return row;
        });
        this._scroll.visible = results.length > 0;

        const keep = results.findIndex(r => r.id === selectedId);
        this._select(keep >= 0 ? keep : 0);
    }

    _select(index, scroll = true) {
        if (this._rows.length === 0) {
            this._selected = 0;
            return;
        }
        this._rows[this._selected]?.setSelected(false);
        this._selected = Math.max(0, Math.min(index, this._rows.length - 1));
        const row = this._rows[this._selected];
        row.setSelected(true);
        if (scroll)
            ensureActorVisibleInScrollView(this._scroll, row);

        const altLabel = this._results[this._selected]?.altLabel;
        this._altHint.visible = Boolean(altLabel);
        this._altHintLabel.text = altLabel ?? '';
    }

    _activate(index, alternate = false) {
        const result = this._results[index];
        const action = alternate ? result?.altActivate : result?.activate;
        if (!action)
            return;
        // Release the grab first so the launched app or window gets focus.
        this.close();
        action();
    }

    _onKeyPress(event) {
        switch (event.get_key_symbol()) {
        case Clutter.KEY_Escape:
            this.close();
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Down:
            this._select(this._selected + 1);
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Up:
            this._select(this._selected - 1);
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Return:
        case Clutter.KEY_KP_Enter:
            this._activate(this._selected,
                (event.get_state() & Clutter.ModifierType.CONTROL_MASK) !== 0);
            return Clutter.EVENT_STOP;
        default:
            return Clutter.EVENT_PROPAGATE;
        }
    }

    vfunc_button_press_event(event) {
        // A click outside the panel closes the bar.
        const [x, y] = event.get_coords();
        const [px, py] = this._panel.get_transformed_position();
        const [pw, ph] = this._panel.get_transformed_size();
        if (x < px || x > px + pw || y < py || y > py + ph)
            this.close();
        return Clutter.EVENT_STOP;
    }
});

function addHint(box, key, action) {
    box.add_child(new St.Label({text: key, style_class: 'ab-key'}));
    const label = new St.Label({text: action, style_class: 'ab-key-label'});
    box.add_child(label);
    return label;
}

function searchingRow(iconName) {
    return {
        id: 'status:searching',
        title: 'Searching…',
        subtitle: '',
        kind: '',
        score: 0,
        createIcon: () => new St.Icon({icon_name: iconName, icon_size: 32, style_class: 'ab-dim'}),
        activate: null,
    };
}

function errorRow(message) {
    return {
        id: 'status:error',
        title: 'Search failed',
        subtitle: message,
        kind: '',
        score: 0,
        createIcon: () => new St.Icon({icon_name: 'dialog-warning-symbolic', icon_size: 32}),
        activate: null,
    };
}
