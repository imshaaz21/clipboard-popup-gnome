import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk?version=4.0';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class ClipboardPopupPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.set_default_size(720, 740);
        window.search_enabled = true;

        const page = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'preferences-system-symbolic',
        });
        window.add(page);

        const group = new Adw.PreferencesGroup({
            title: _('History'),
            description: _('Choose how much clipboard content to keep.'),
        });
        page.add(group);

        const sizeRow = new Adw.SpinRow({
            title: _('History Size'),
            subtitle: _('Maximum number of entries, excluding favorites'),
            adjustment: new Gtk.Adjustment({lower: 5, upper: 200, step_increment: 5}),
        });
        settings.bind('history-size', sizeRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        group.add(sizeRow);

        const cacheSizeRow = new Adw.SpinRow({
            title: _('Content Limit (MB)'),
            subtitle: _('Includes favorites. Existing favorites are kept if the limit is reduced.'),
            adjustment: new Gtk.Adjustment({lower: 1, upper: 100, step_increment: 1}),
        });
        settings.bind('cache-size', cacheSizeRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        group.add(cacheSizeRow);

        const stripRow = new Adw.SwitchRow({
            title: _('Trim Whitespace'),
            subtitle: _('Remove spaces and blank lines at the start and end of copied text'),
        });
        settings.bind('strip-text', stripRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(stripRow);

        const appearance = new Adw.PreferencesGroup({title: _('Popup')});
        page.add(appearance);

        const displayRow = new Adw.SpinRow({
            title: _('Visible Entries'),
            subtitle: _('Limit the list length without removing older history'),
            adjustment: new Gtk.Adjustment({lower: 10, upper: 200, step_increment: 10}),
        });
        settings.bind('max-displayed-entries', displayRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        appearance.add(displayRow);

        const previewRow = new Adw.SpinRow({
            title: _('Preview Length'),
            subtitle: _('Number of characters shown for each text entry'),
            adjustment: new Gtk.Adjustment({lower: 20, upper: 300, step_increment: 10}),
        });
        settings.bind('preview-length', previewRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        appearance.add(previewRow);

        const searchRow = new Adw.SwitchRow({
            title: _('Search as You Type'),
            subtitle: _('Show a search field in the popup'),
        });
        settings.bind('enable-typeahead-search', searchRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        appearance.add(searchRow);

        const notifyRow = new Adw.SwitchRow({
            title: _('Copy Notifications'),
            subtitle: _('Show a notification when an entry is added to history'),
        });
        settings.bind('notify-on-copy', notifyRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        appearance.add(notifyRow);

        const selection = new Adw.PreferencesGroup({title: _('Selecting an Entry')});
        page.add(selection);

        const pasteRow = new Adw.SwitchRow({
            title: _('Paste Automatically'),
            subtitle: _('Paste into the active application when you select an entry'),
        });
        settings.bind('paste-on-select', pasteRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        selection.add(pasteRow);

        const pasteModes = ['ctrl-v', 'ctrl-shift-v', 'shift-insert'];
        const pasteModeRow = new Adw.ComboRow({
            title: _('Paste Shortcut'),
            subtitle: _('For terminals, try Ctrl+Shift+V'),
            model: Gtk.StringList.new(['Ctrl+V', 'Ctrl+Shift+V', 'Shift+Insert']),
            selected: Math.max(0, pasteModes.indexOf(settings.get_string('paste-shortcut'))),
        });
        pasteModeRow.connect('notify::selected', () =>
            settings.set_string('paste-shortcut', pasteModes[pasteModeRow.selected]));
        settings.bind('paste-on-select', pasteModeRow, 'sensitive', Gio.SettingsBindFlags.GET);
        selection.add(pasteModeRow);

        const moveRow = new Adw.SwitchRow({
            title: _('Move Selected Entry to Top'),
            subtitle: _('Keep recently used entries at the start of history'),
        });
        settings.bind('move-item-first', moveRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        selection.add(moveRow);

        const privacyPage = new Adw.PreferencesPage({
            title: _('Privacy'),
            icon_name: 'changes-prevent-symbolic',
        });
        window.add(privacyPage);
        const recording = new Adw.PreferencesGroup({
            title: _('Recording'),
            description: _('Control what is added to your clipboard history.'),
        });
        privacyPage.add(recording);

        const privateRow = new Adw.SwitchRow({
            title: _('Private Mode'),
            subtitle: _('Pause recording until private mode is turned off'),
        });
        settings.bind('private-mode', privateRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        recording.add(privateRow);

        const primaryRow = new Adw.SwitchRow({
            title: _('Include Selected Text'),
            subtitle: _('Also record text selected with the mouse, without copying'),
        });
        settings.bind('process-primary-selection', primaryRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        recording.add(primaryRow);

        const exclusions = new Adw.PreferencesGroup({
            title: _('Excluded Applications'),
            description: _('Do not record while these applications are focused. Enter application IDs or window classes, separated by commas.'),
        });
        privacyPage.add(exclusions);
        const excludedRow = new Adw.EntryRow({
            title: _('Application IDs'),
            show_apply_button: true,
            text: settings.get_strv('excluded-apps').join(', '),
        });
        excludedRow.connect('apply', () => settings.set_strv('excluded-apps',
            [...new Set(excludedRow.text.split(',').map(id => id.trim()).filter(Boolean))]));
        exclusions.add(excludedRow);

        const storage = new Adw.PreferencesGroup({title: _('Saved History')});
        privacyPage.add(storage);
        const cacheRow = new Adw.SwitchRow({
            title: _('Save Only Favorites'),
            subtitle: _('Remove other entries from saved history and keep them only until restart'),
        });
        settings.bind('cache-only-favorites', cacheRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        storage.add(cacheRow);

        const expiryRow = new Adw.SpinRow({
            title: _('Remove Entries After (Hours)'),
            subtitle: _('Set to 0 to keep indefinitely. Favorites are never removed.'),
            adjustment: new Gtk.Adjustment({lower: 0, upper: 8760, step_increment: 1}),
        });
        settings.bind('expire-hours', expiryRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        storage.add(expiryRow);

        const confirmRow = new Adw.SwitchRow({
            title: _('Confirm Before Clearing'),
            subtitle: _('Ask before clearing history. Favorites are kept.'),
        });
        settings.bind('confirm-clear', confirmRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        storage.add(confirmRow);

        const secrets = new Adw.PreferencesGroup({
            description: _('Content marked as secret by password managers is never recorded. Unmarked secrets cannot be detected; use private mode or exclude the application.'),
        });
        privacyPage.add(secrets);

        this._addShortcutsPage(window, settings);

        const aboutPage = new Adw.PreferencesPage({
            title: _('About'),
            icon_name: 'help-about-symbolic',
        });
        window.add(aboutPage);
        const identity = new Adw.PreferencesGroup();
        const header = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 24,
            margin_bottom: 24,
        });
        header.append(new Gtk.Image({
            icon_name: 'edit-paste-symbolic',
            pixel_size: 64,
        }));
        header.append(new Gtk.Label({
            label: _('Clipboard Popup'),
            css_classes: ['title-1'],
        }));
        header.append(new Gtk.Label({
            label: _('Your clipboard history, close at hand'),
            css_classes: ['dim-label'],
            wrap: true,
            justify: Gtk.Justification.CENTER,
        }));
        identity.add(header);
        aboutPage.add(identity);

        const about = new Adw.PreferencesGroup();
        about.add(new Adw.ActionRow({
            title: _('Version'),
            subtitle: this.metadata['version-name'],
        }));
        about.add(this._linkRow(window, _('Project Page'),
            _('Documentation and source code'), this.metadata.url, 'web-browser-symbolic'));
        about.add(this._linkRow(window, _('Report a Bug'),
            _('Open the bug report form on GitHub'),
            `${this.metadata.url}/issues/new?template=bug_report.yml`, 'bug-symbolic'));
        aboutPage.add(about);
    }

    _addShortcutsPage(window, settings) {
        const page = new Adw.PreferencesPage({
            title: _('Shortcuts'),
            icon_name: 'preferences-desktop-keyboard-shortcuts-symbolic',
        });
        window.add(page);
        const master = new Adw.PreferencesGroup();
        const enabled = new Adw.SwitchRow({
            title: _('Keyboard Shortcuts'),
            subtitle: _('Turn off shortcuts without losing your assignments'),
        });
        settings.bind('enable-keybindings', enabled, 'active', Gio.SettingsBindFlags.DEFAULT);
        master.add(enabled);
        page.add(master);

        const group = new Adw.PreferencesGroup({
            title: _('Key Assignments'),
            description: _('Shortcuts start unassigned. Click an action, then press your keys to set it. Super+V may conflict with GNOME notifications.'),
        });
        page.add(group);
        const shortcuts = [
            ['popup-shortcut', _('Open Clipboard'), _('Show the clipboard popup')],
            ['next-entry', _('Next Entry'), _('Select the next older entry')],
            ['prev-entry', _('Previous Entry'), _('Select the next newer entry')],
            ['toggle-private-mode', _('Toggle Private Mode'), _('Pause or resume recording')],
            ['clear-history', _('Clear History'), _('Remove all entries except favorites')],
        ];
        const signalIds = [];
        let shortcutDialog = null;
        for (const [key, title, subtitle] of shortcuts) {
            const row = new Adw.ActionRow({
                title, subtitle, activatable: true,
                tooltip_text: _('Click to change the shortcut'),
            });
            const label = new Gtk.ShortcutLabel({
                disabled_text: _('Not Set'),
                valign: Gtk.Align.CENTER,
            });
            const clearButton = new Gtk.Button({
                icon_name: 'edit-clear-symbolic',
                tooltip_text: _('Remove shortcut'),
                valign: Gtk.Align.CENTER,
                css_classes: ['flat'],
            });
            clearButton.connect('clicked', () => settings.set_strv(key, []));
            const refresh = () => {
                label.accelerator = settings.get_strv(key)[0] ?? '';
                clearButton.sensitive = settings.get_strv(key).length > 0;
            };
            refresh();
            signalIds.push(settings.connect(`changed::${key}`, refresh));
            row.add_suffix(label);
            row.add_suffix(clearButton);
            settings.bind('enable-keybindings', row, 'sensitive', Gio.SettingsBindFlags.GET);
            row.connect('activated', () => {
                if (shortcutDialog) {
                    shortcutDialog.present();
                    return;
                }
                const dialog = this._editShortcut(window, settings, shortcuts, key, title);
                shortcutDialog = dialog;
                dialog.connect('unrealize', () => {
                    if (shortcutDialog === dialog)
                        shortcutDialog = null;
                });
            });
            group.add(row);
        }
        const cleanup = () => {
            for (const id of signalIds.splice(0))
                settings.disconnect(id);
            const dialog = shortcutDialog;
            shortcutDialog = null;
            dialog?.destroy();
            return false;
        };
        window.connect('close-request', cleanup);
        window.connect('unrealize', cleanup);
    }

    _editShortcut(window, settings, shortcuts, key, title) {
        const dialog = new Adw.Window({
            title: _('Set Shortcut'),
            transient_for: window,
            modal: true,
            destroy_with_parent: true,
            resizable: false,
            default_width: 440,
        });
        dialog.connect('realize', () => dialog.get_surface().inhibit_system_shortcuts(null));
        dialog.connect('close-request', () => {
            dialog.get_surface()?.restore_system_shortcuts();
            return false;
        });
        dialog.connect('unrealize', () => dialog.get_surface()?.restore_system_shortcuts());
        const content = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL});
        dialog.content = content;
        content.append(new Adw.HeaderBar({
            title_widget: new Adw.WindowTitle({title: _('Set Shortcut')}),
        }));
        const body = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 18,
            margin_top: 18,
            margin_bottom: 30,
            margin_start: 30,
            margin_end: 30,
        });
        content.append(body);
        body.append(new Gtk.Label({
            label: title,
            css_classes: ['title-2'],
            wrap: true,
            justify: Gtk.Justification.CENTER,
        }));
        const hint = new Gtk.Label({
            label: _('Press a key combination to assign it'),
            wrap: true,
            justify: Gtk.Justification.CENTER,
            max_width_chars: 40,
        });
        body.append(hint);
        body.append(new Gtk.ShortcutLabel({
            accelerator: settings.get_strv(key)[0] ?? '',
            disabled_text: _('Not Set'),
            halign: Gtk.Align.CENTER,
        }));
        body.append(new Gtk.Label({
            label: _('Esc to cancel · Backspace to remove'),
            css_classes: ['dim-label'],
        }));

        const controller = new Gtk.EventControllerKey({
            propagation_phase: Gtk.PropagationPhase.CAPTURE,
        });
        controller.connect('key-pressed', (_controller, keyval, _keycode, state) => {
            const modifiers = state & Gtk.accelerator_get_default_mod_mask();
            if (keyval === Gdk.KEY_Escape && !modifiers) {
                dialog.close();
                return Gdk.EVENT_STOP;
            }
            if (keyval === Gdk.KEY_BackSpace && !modifiers) {
                settings.set_strv(key, []);
                dialog.close();
                return Gdk.EVENT_STOP;
            }
            if ([Gdk.KEY_Control_L, Gdk.KEY_Control_R, Gdk.KEY_Shift_L, Gdk.KEY_Shift_R,
                Gdk.KEY_Alt_L, Gdk.KEY_Alt_R, Gdk.KEY_Super_L, Gdk.KEY_Super_R,
                Gdk.KEY_Meta_L, Gdk.KEY_Meta_R, Gdk.KEY_ISO_Level3_Shift].includes(keyval))
                return Gdk.EVENT_STOP;

            keyval = keyval === Gdk.KEY_ISO_Left_Tab ? Gdk.KEY_Tab : Gdk.keyval_to_lower(keyval);
            if (!modifiers || !Gtk.accelerator_valid(keyval, modifiers)) {
                hint.label = _('Include Ctrl, Alt, or Super in your shortcut');
                hint.add_css_class('error');
                return Gdk.EVENT_STOP;
            }
            const accelerator = Gtk.accelerator_name(keyval, modifiers);
            const duplicate = shortcuts.find(([other]) => other !== key &&
                settings.get_strv(other).some(value => {
                    const [valid, otherKey, otherMods] = Gtk.accelerator_parse(value);
                    return valid && Gtk.accelerator_name(otherKey, otherMods) === accelerator;
                }));
            if (duplicate) {
                hint.label = _('Already used for “%s”').replace('%s', duplicate[1]);
                hint.add_css_class('error');
                return Gdk.EVENT_STOP;
            }
            settings.set_strv(key, [accelerator]);
            dialog.close();
            return Gdk.EVENT_STOP;
        });
        dialog.add_controller(controller);
        dialog.present();
        return dialog;
    }

    _linkRow(window, title, subtitle, uri, icon) {
        const row = new Adw.ActionRow({title, subtitle, activatable: true});
        row.add_suffix(new Gtk.Image({
            gicon: new Gio.ThemedIcon({names: [icon, 'external-link-symbolic', 'go-next-symbolic']}),
            valign: Gtk.Align.CENTER,
        }));
        row.connect('activated', () => {
            const launcher = new Gtk.UriLauncher({uri});
            launcher.launch(window, null, (source, result) => {
                try {
                    source.launch_finish(result);
                } catch (error) {
                    if (error.matches(Gtk.DialogError, Gtk.DialogError.DISMISSED))
                        return;
                    console.error(error);
                    window.add_toast(new Adw.Toast({
                        title: _('Could not open the link'),
                    }));
                }
            });
        });
        return row;
    }
}
