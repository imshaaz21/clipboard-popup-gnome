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
            title: _('Content budget (MB)'),
            subtitle: _('Includes pinned content. Existing pins survive a lower limit.'),
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

        const pasteModes = ['ctrl-v', 'ctrl-shift-v', 'shift-insert'];
        const pasteModeRow = new Adw.ComboRow({
            title: _('Paste key combination'),
            subtitle: _('Application-dependent. Terminals commonly use Ctrl+Shift+V.'),
            model: Gtk.StringList.new(['Ctrl+V', 'Ctrl+Shift+V', 'Shift+Insert']),
            selected: Math.max(0, pasteModes.indexOf(settings.get_string('paste-shortcut'))),
        });
        pasteModeRow.connect('notify::selected', () =>
            settings.set_string('paste-shortcut', pasteModes[pasteModeRow.selected]));
        group.add(pasteModeRow);

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
            subtitle: _('Ask before clearing history from menus or shortcuts'),
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
            subtitle: _('New unpinned text and images stay in memory. Existing cache is rewritten.'),
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

        const expiryRow = new Adw.SpinRow({
            title: _('Expire unpinned entries after hours'),
            subtitle: _('Zero disables expiry. Favorites are kept.'),
            adjustment: new Gtk.Adjustment({lower: 0, upper: 8760, step_increment: 1}),
        });
        settings.bind('expire-hours', expiryRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        group.add(expiryRow);

        const excludedRow = new Adw.EntryRow({
            title: _('Excluded application IDs (comma-separated)'),
            show_apply_button: true,
            text: settings.get_strv('excluded-apps').join(', '),
        });
        excludedRow.connect('apply', () => settings.set_strv('excluded-apps',
            [...new Set(excludedRow.text.split(',').map(id => id.trim()).filter(Boolean))]));
        group.add(excludedRow);
        group.add(new Adw.ActionRow({
            title: _('Password-manager hints are always respected'),
            subtitle: _('Unmarked secrets cannot be detected. Use private mode or exclude their application.'),
        }));

        const keysGroup = new Adw.PreferencesGroup({
            title: _('Keyboard shortcuts'),
            description: _('Shortcuts are opt-in. Enter GTK notation such as &lt;Super&gt;v for Win+V-style access; this may conflict with GNOME notifications.'),
        });
        page.add(keysGroup);

        const makeShortcutRow = (key, title) => {
            const row = new Adw.EntryRow({
                title: `${title} (${_('empty disables')})`,
                show_apply_button: true,
                text: settings.get_strv(key)[0] ?? '',
            });
            row.connect('apply', () => {
                const accel = row.text.trim();
                const [valid, keyval, modifiers] = Gtk.accelerator_parse(accel);
                const canonical = valid ? Gtk.accelerator_name(keyval, modifiers) : '';
                const duplicate = ['popup-shortcut', 'next-entry', 'prev-entry', 'toggle-private-mode', 'clear-history']
                    .some(other => other !== key && settings.get_strv(other).some(value => {
                        const [parsed, otherKey, otherMods] = Gtk.accelerator_parse(value);
                        return parsed && Gtk.accelerator_name(otherKey, otherMods) === canonical;
                    }));
                if (accel && (!valid || !modifiers || !Gtk.accelerator_valid(keyval, modifiers) || duplicate)) {
                    row.add_css_class('error');
                    return;
                }
                row.remove_css_class('error');
                settings.set_strv(key, accel ? [canonical] : []);
                row.text = accel ? canonical : '';
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
