import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {mergeBangs} from './core/web.js';

export default class AskBarPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window._settings = settings;
        window.set_default_size(640, 720);

        window.add(generalPage(settings));
        window.add(searchPage(settings));
        window.add(appearancePage(settings));
        window.add(shortcutsPage(settings));
    }
}

// ── Pages ────────────────────────────────────────────────────────────

function generalPage(settings) {
    const page = new Adw.PreferencesPage({title: 'General', icon_name: 'preferences-system-symbolic'});

    const general = new Adw.PreferencesGroup({title: 'General'});
    general.add(shortcutRow(settings));
    general.add(spinRow(settings, 'max-results', 'Maximum results', 'How many results the bar shows at most', 3, 20, 1));
    general.add(comboRow(settings, 'open-on-monitor', 'Open on', [
        ['pointer', 'Monitor with the pointer'],
        ['primary', 'Primary monitor'],
    ]));
    general.add(switchRow(settings, 'remember-query', 'Remember last search',
        'Reopen with the previous search, selected so typing replaces it'));
    page.add(general);

    const tips = new Adw.PreferencesGroup({
        title: 'Prefixes',
        description: '@ files and folders  ·  / commands  ·  = math  ·  ! web shortcuts',
    });
    page.add(tips);
    return page;
}

function searchPage(settings) {
    const page = new Adw.PreferencesPage({title: 'Search', icon_name: 'system-search-symbolic'});

    const sources = new Adw.PreferencesGroup({
        title: 'Default search',
        description: 'What appears when you type without a prefix',
    });
    sources.add(switchRow(settings, 'search-apps', 'Apps', null));
    sources.add(switchRow(settings, 'search-windows', 'Open windows', null));
    sources.add(switchRow(settings, 'search-calculator', 'Calculator', 'Answer math like 2340 * 1.15'));
    sources.add(switchRow(settings, 'search-commands', 'Commands', 'System and custom commands, like "lock"'));
    const files = switchRow(settings, 'search-files', 'Files', 'The best file and project matches');
    sources.add(files);
    const fileCount = spinRow(settings, 'default-file-results', 'File results', 'How many files to add', 1, 10, 1);
    settings.bind('search-files', fileCount, 'sensitive', Gio.SettingsBindFlags.GET);
    sources.add(fileCount);
    page.add(sources);

    const web = new Adw.PreferencesGroup({title: 'Web'});
    web.add(switchRow(settings, 'web-fallback', 'Offer a web search',
        'End results with "Search the web for …" and open typed URLs'));
    const learning = new Adw.PreferencesGroup({title: 'Learning'});
    learning.add(switchRow(settings, 'learn-choices', 'Learn from your choices',
        'Results you pick often rank higher for what you typed. Stored only on this computer.'));
    const forget = new Adw.ButtonRow({title: 'Forget Learned Choices'});
    forget.connect('activated', () => {
        settings.set_int('clear-learning', settings.get_int('clear-learning') + 1);
        forget.set_title('Forgotten');
        forget.set_sensitive(false);
    });
    learning.add(forget);
    page.add(learning);

    web.add(switchRow(settings, 'ask-ai-apps', 'Ask AI apps',
        'Offer “Ask Claude” / “Ask ChatGPT” when those apps are installed'));
    const engine = engineRow(settings);
    settings.bind('web-fallback', engine, 'sensitive', Gio.SettingsBindFlags.GET);
    web.add(engine);
    page.add(web);

    const filesGroup = new Adw.PreferencesGroup({title: 'Files (@)'});
    filesGroup.add(spinRow(settings, 'recent-files-count', 'Recent files',
        'How many recent files a bare @ shows', 0, 30, 1));
    filesGroup.add(switchRow(settings, 'index-projects', 'Find git projects',
        'GNOME’s file index skips git repositories; scan for them instead'));
    const depth = spinRow(settings, 'project-scan-depth', 'Project scan depth',
        'Folder levels below your home folder to search', 2, 10, 1);
    settings.bind('index-projects', depth, 'sensitive', Gio.SettingsBindFlags.GET);
    filesGroup.add(depth);
    page.add(filesGroup);
    return page;
}

function appearancePage(settings) {
    const page = new Adw.PreferencesPage({title: 'Appearance', icon_name: 'applications-graphics-symbolic'});

    const layout = new Adw.PreferencesGroup({title: 'Layout'});
    layout.add(spinRow(settings, 'panel-width', 'Width', 'In pixels', 480, 1200, 20));
    layout.add(spinRow(settings, 'panel-position', 'Vertical position',
        'Distance from the top of the screen, in percent', 5, 50, 1));
    layout.add(switchRow(settings, 'compact-mode', 'Compact results', 'Smaller rows without descriptions'));
    page.add(layout);

    const style = new Adw.PreferencesGroup({title: 'Style'});
    style.add(switchRow(settings, 'dim-background', 'Dim the background', null));
    style.add(switchRow(settings, 'show-footer', 'Show key hints', 'Keyboard hints at the bottom of the bar'));
    style.add(switchRow(settings, 'animations', 'Animations', null));
    page.add(style);

    const reset = new Adw.PreferencesGroup();
    const resetRow = new Adw.ButtonRow({title: 'Reset All Settings'});
    resetRow.add_css_class('destructive-action');
    resetRow.connect('activated', () => {
        for (const key of settings.settings_schema.list_keys()) {
            // Keep your commands and shortcuts; resetting clear-learning would
            // count as "forget" and wipe what was learned.
            if (!key.startsWith('custom-') && key !== 'clear-learning')
                settings.reset(key);
        }
    });
    reset.add(resetRow);
    page.add(reset);
    return page;
}

function shortcutsPage(settings) {
    const page = new Adw.PreferencesPage({title: 'Shortcuts', icon_name: 'utilities-terminal-symbolic'});
    page.add(new JsonListGroup({
        settings,
        key: 'custom-commands',
        title: 'Custom commands',
        description: 'Run with / followed by the name. Commands run with sh -c.',
        fields: [['name', 'Name'], ['command', 'Shell command']],
        rowTitle: item => item.name || 'New command',
        rowSubtitle: item => item.command,
    }));
    page.add(new JsonListGroup({
        settings,
        key: 'custom-web-shortcuts',
        title: 'Web shortcuts',
        description: 'Search with ! followed by the key, e.g. !gh gnome. Use %s in the URL for the search text. ' +
            'Built in: g, ddg, gh, yt, so, w, mdn, npm, pypi, maps (a custom key replaces a built-in one).',
        fields: [['key', 'Key (e.g. gl)'], ['name', 'Name'], ['url', 'URL with %s']],
        rowTitle: item => (item.key ? `!${item.key}  ${item.name ?? ''}` : 'New shortcut'),
        rowSubtitle: item => item.url,
    }));
    return page;
}

// ── Rows ─────────────────────────────────────────────────────────────

function switchRow(settings, key, title, subtitle) {
    const row = new Adw.SwitchRow({title});
    if (subtitle)
        row.set_subtitle(subtitle);
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

function spinRow(settings, key, title, subtitle, min, max, step) {
    const row = Adw.SpinRow.new_with_range(min, max, step);
    row.set_title(title);
    if (subtitle)
        row.set_subtitle(subtitle);
    settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

// A dropdown for a string setting; `options` is [[value, label], ...].
function comboRow(settings, key, title, options) {
    const row = new Adw.ComboRow({title, model: Gtk.StringList.new(options.map(([, label]) => label))});
    const sync = () => {
        const index = options.findIndex(([value]) => value === settings.get_string(key));
        row.selected = Math.max(0, index);
    };
    sync();
    row.connect('notify::selected', () => settings.set_string(key, options[row.selected][0]));
    settings.connect(`changed::${key}`, sync);
    return row;
}

// Default search engine, from the built-in and custom web shortcuts.
function engineRow(settings) {
    const engines = () => {
        let custom = [];
        try {
            custom = JSON.parse(settings.get_string('custom-web-shortcuts'));
        } catch {}
        return mergeBangs(Array.isArray(custom) ? custom : []);
    };
    return comboRow(settings, 'default-search-engine', 'Search engine',
        engines().map(b => [b.key, `${b.name}  (!${b.key})`]));
}

// The shortcut is typed in GTK accelerator form, e.g. <Alt>space.
function shortcutRow(settings) {
    const row = new Adw.EntryRow({
        title: 'Keyboard shortcut (e.g. <Alt>space, <Control>space, <Super>a)',
        show_apply_button: true,
        text: settings.get_strv('toggle-shortcut')[0] ?? '',
    });
    row.connect('apply', () => {
        const text = row.text.trim();
        const [ok, keyval] = Gtk.accelerator_parse(text);
        if (ok && keyval !== 0) {
            settings.set_strv('toggle-shortcut', [text]);
            row.remove_css_class('error');
        } else {
            row.add_css_class('error');
        }
    });
    return row;
}

// ── Editable JSON list ───────────────────────────────────────────────

// Edits a JSON-array string setting: one expandable row per item with a
// text field per property, plus Add and Remove buttons. Saves on every edit.
const JsonListGroup = GObject.registerClass(
class JsonListGroup extends Adw.PreferencesGroup {
    _init({settings, key, title, description, fields, rowTitle, rowSubtitle}) {
        super._init({title, description});
        this._settings = settings;
        this._key = key;
        this._fields = fields;
        this._rowTitle = rowTitle;
        this._rowSubtitle = rowSubtitle;
        this._rows = [];

        const add = new Gtk.Button({icon_name: 'list-add-symbolic', valign: Gtk.Align.CENTER});
        add.add_css_class('flat');
        add.set_tooltip_text('Add');
        add.connect('clicked', () => {
            this._addRow({});
            this._save();
        });
        this.set_header_suffix(add);

        for (const item of this._load())
            this._addRow(item);
    }

    _load() {
        try {
            const list = JSON.parse(this._settings.get_string(this._key));
            return Array.isArray(list) ? list : [];
        } catch {
            return [];
        }
    }

    _addRow(item) {
        const row = new Adw.ExpanderRow({title: this._rowTitle(item), subtitle: this._rowSubtitle(item) ?? ''});
        const entries = this._fields.map(([field, label]) => {
            const entry = new Adw.EntryRow({title: label, text: item[field] ?? ''});
            entry.connect('changed', () => {
                const current = this._itemOf(entries);
                row.title = this._rowTitle(current);
                row.subtitle = this._rowSubtitle(current) ?? '';
                this._save();
            });
            row.add_row(entry);
            return entry;
        });

        const remove = new Gtk.Button({icon_name: 'user-trash-symbolic', valign: Gtk.Align.CENTER});
        remove.add_css_class('flat');
        remove.set_tooltip_text('Remove');
        remove.connect('clicked', () => {
            this.remove(row);
            this._rows = this._rows.filter(r => r.row !== row);
            this._save();
        });
        row.add_suffix(remove);
        row.set_expanded(Object.keys(item).length === 0);

        this._rows.push({row, entries});
        this.add(row);
    }

    _itemOf(entries) {
        return Object.fromEntries(this._fields.map(([field], i) => [field, entries[i].text.trim()]));
    }

    _save() {
        const list = this._rows.map(({entries}) => this._itemOf(entries));
        this._settings.set_string(this._key, JSON.stringify(list));
    }
});
