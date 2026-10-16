import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

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
            subtitle: _('Simulate Ctrl+V after picking an entry'),
        });
        settings.bind('paste-on-select', pasteRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(pasteRow);

        const shortcutRow = new Adw.ActionRow({
            title: _('Popup shortcut'),
            subtitle: _('Default: Super+V. Change it in Settings → Keyboard → Custom Shortcuts, or edit the popup-shortcut gsetting.'),
        });
        group.add(shortcutRow);
    }
}
