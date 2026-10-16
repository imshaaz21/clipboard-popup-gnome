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

        const displayRow = new Adw.SpinRow({
            title: _('Maximum displayed entries'),
            subtitle: _('Entries rendered in the popup; older ones stay in history'),
            adjustment: new Gtk.Adjustment({lower: 10, upper: 200, step_increment: 10}),
        });
        settings.bind('max-displayed-entries', displayRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        group.add(displayRow);

        const cacheSizeRow = new Adw.SpinRow({
            title: _('Cache size (MB)'),
            subtitle: _('Maximum total size of persisted history'),
            adjustment: new Gtk.Adjustment({lower: 1, upper: 100, step_increment: 1}),
        });
        settings.bind('cache-size', cacheSizeRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        group.add(cacheSizeRow);

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

        const notifyRow = new Adw.SwitchRow({
            title: _('Notify on copy'),
            subtitle: _('Show an OSD when new content is recorded'),
        });
        settings.bind('notify-on-copy', notifyRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(notifyRow);

        const confirmRow = new Adw.SwitchRow({
            title: _('Confirm clear'),
            subtitle: _('Require a second click before wiping history'),
        });
        settings.bind('confirm-clear', confirmRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(confirmRow);

        const stripRow = new Adw.SwitchRow({
            title: _('Strip text'),
            subtitle: _('Trim whitespace from copied text'),
        });
        settings.bind('strip-text', stripRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(stripRow);

        const moveRow = new Adw.SwitchRow({
            title: _('Move item first'),
            subtitle: _('Selected entries jump to the top of history'),
        });
        settings.bind('move-item-first', moveRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(moveRow);

        const cacheRow = new Adw.SwitchRow({
            title: _('Cache only favorites'),
            subtitle: _('Only pinned entries survive a restart'),
        });
        settings.bind('cache-only-favorites', cacheRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(cacheRow);

        const keyswitchRow = new Adw.SwitchRow({
            title: _('Enable keybindings'),
            subtitle: _('Master switch for all shortcuts'),
        });
        settings.bind('enable-keybindings', keyswitchRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(keyswitchRow);

        const searchRow = new Adw.SwitchRow({
            title: _('Typeahead search'),
            subtitle: _('Filter history as you type in the popup'),
        });
        settings.bind('enable-typeahead-search', searchRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(searchRow);

        const primaryRow = new Adw.SwitchRow({
            title: _('Track primary selection'),
            subtitle: _('Record text selected with the mouse, not just copied'),
        });
        settings.bind('process-primary-selection', primaryRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(primaryRow);

        const mimeRow = new Adw.SwitchRow({
            title: _('Ignore password-manager contents'),
            subtitle: _('Skip clipboard contents flagged by password managers'),
        });
        settings.bind('ignore-password-mimes', mimeRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(mimeRow);

        const keysGroup = new Adw.PreferencesGroup({title: _('Keyboard shortcuts')});
        page.add(keysGroup);

        const makeShortcutRow = (key, title) => {
            const row = new Adw.EntryRow({
                title: `${title} (${_('empty disables')})`,
                show_apply_button: true,
                text: settings.get_strv(key)[0] ?? '',
            });
            row.connect('apply', () => {
                const accel = row.text.trim();
                if (accel && !Gtk.accelerator_parse(accel)[0]) {
                    row.add_css_class('error');
                    return;
                }
                row.remove_css_class('error');
                settings.set_strv(key, accel ? [accel] : []);
            });
            keysGroup.add(row);
        };

        makeShortcutRow('popup-shortcut', _('Popup at pointer'));
        makeShortcutRow('next-entry', _('Next entry (older)'));
        makeShortcutRow('prev-entry', _('Previous entry (newer)'));
        makeShortcutRow('toggle-private-mode', _('Toggle private mode'));
        makeShortcutRow('clear-history', _('Clear history'));
    }
}
