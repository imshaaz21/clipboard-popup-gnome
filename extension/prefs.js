import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class ClipboardPopupPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();
        window.add(page);

        const group = new Adw.PreferencesGroup({title: _('Clipboard history')});
        page.add(group);

        const sizeRow = new Adw.SpinRow({
            title: _('History size'),
            subtitle: _('Maximum unpinned entries kept'),
            adjustment: new Gtk.Adjustment({lower: 5, upper: 200, step_increment: 5}),
        });
        settings.bind('history-size', sizeRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        group.add(sizeRow);

        const previewRow = new Adw.SpinRow({
            title: _('Text preview length'),
            subtitle: _('Characters shown per text entry'),
            adjustment: new Gtk.Adjustment({lower: 20, upper: 300, step_increment: 10}),
        });
        settings.bind('preview-length', previewRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        group.add(previewRow);

        const pasteRow = new Adw.SwitchRow({
            title: _('Paste on select'),
            subtitle: _('Simulate a paste keypress after picking an entry'),
        });
        settings.bind('paste-on-select', pasteRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(pasteRow);

        const privateRow = new Adw.SwitchRow({
            title: _('Private mode'),
            subtitle: _('Stop recording clipboard contents until turned off'),
        });
        settings.bind('private-mode', privateRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(privateRow);

        const shortcutRow = new Adw.EntryRow({
            title: _('Popup shortcut (e.g. <Super>v, empty disables)'),
            show_apply_button: true,
            text: settings.get_strv('popup-shortcut')[0] ?? '',
        });
        shortcutRow.connect('apply', () => {
            const accel = shortcutRow.text.trim();
            if (accel && !Gtk.accelerator_parse(accel)[0]) {
                shortcutRow.add_css_class('error');
                return;
            }
            shortcutRow.remove_css_class('error');
            settings.set_strv('popup-shortcut', accel ? [accel] : []);
        });
        group.add(shortcutRow);
    }
}
