import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
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
        window.add(page);
    }
}
