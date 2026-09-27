import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class AskBarPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window._settings = settings;

        const group = new Adw.PreferencesGroup({title: 'General'});

        // The shortcut is typed in GTK accelerator form, e.g. <Alt>space.
        const shortcut = new Adw.EntryRow({
            title: 'Keyboard shortcut (e.g. <Alt>space, <Control>space, <Super>a)',
            show_apply_button: true,
            text: settings.get_strv('toggle-shortcut')[0] ?? '',
        });
        shortcut.connect('apply', () => {
            const text = shortcut.text.trim();
            const [ok, key] = Gtk.accelerator_parse(text);
            if (ok && key !== 0) {
                settings.set_strv('toggle-shortcut', [text]);
                shortcut.remove_css_class('error');
            } else {
                shortcut.add_css_class('error');
            }
        });
        group.add(shortcut);

        const maxResults = Adw.SpinRow.new_with_range(3, 20, 1);
        maxResults.set_title('Maximum results');
        settings.bind('max-results', maxResults, 'value', Gio.SettingsBindFlags.DEFAULT);
        group.add(maxResults);

        const page = new Adw.PreferencesPage();
        page.add(group);
        page.add(new CustomCommandsGroup(settings));
        window.add(page);
    }
}

// Edits the "custom-commands" JSON list: one row per command, with name and
// shell command fields, plus Add and Remove buttons.
const CustomCommandsGroup = GObject.registerClass(
class CustomCommandsGroup extends Adw.PreferencesGroup {
    _init(settings) {
        super._init({
            title: 'Custom commands',
            description: 'Run from the bar with / followed by the name. Commands run with sh -c.',
        });
        this._settings = settings;
        this._rows = [];

        const add = new Gtk.Button({icon_name: 'list-add-symbolic', valign: Gtk.Align.CENTER});
        add.add_css_class('flat');
        add.set_tooltip_text('Add command');
        add.connect('clicked', () => {
            this._addRow({name: '', command: ''});
            this._save();
        });
        this.set_header_suffix(add);

        for (const item of this._load())
            this._addRow(item);
    }

    _load() {
        try {
            const list = JSON.parse(this._settings.get_string('custom-commands'));
            return Array.isArray(list) ? list : [];
        } catch {
            return [];
        }
    }

    _addRow({name, command}) {
        const row = new Adw.ExpanderRow({title: name || 'New command', subtitle: command});
        const nameRow = new Adw.EntryRow({title: 'Name', text: name});
        const commandRow = new Adw.EntryRow({title: 'Shell command', text: command});
        const sync = () => {
            row.title = nameRow.text || 'New command';
            row.subtitle = commandRow.text;
            this._save();
        };
        nameRow.connect('changed', sync);
        commandRow.connect('changed', sync);

        const remove = new Gtk.Button({icon_name: 'user-trash-symbolic', valign: Gtk.Align.CENTER});
        remove.add_css_class('flat');
        remove.set_tooltip_text('Remove command');
        remove.connect('clicked', () => {
            this.remove(row);
            this._rows = this._rows.filter(r => r.row !== row);
            this._save();
        });
        row.add_suffix(remove);
        row.add_row(nameRow);
        row.add_row(commandRow);
        row.set_expanded(!name);

        this._rows.push({row, nameRow, commandRow});
        this.add(row);
    }

    _save() {
        const list = this._rows.map(({nameRow, commandRow}) => ({
            name: nameRow.text.trim(),
            command: commandRow.text.trim(),
        }));
        this._settings.set_string('custom-commands', JSON.stringify(list));
    }
});
