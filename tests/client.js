import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk?version=4.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';

const app = new Gtk.Application({application_id: 'org.example.ClipboardPopupTest'});
let exported;
let prefsWindow;
app.connect('activate', () => {
    const entry = new Gtk.Entry();
    const window = new Gtk.ApplicationWindow({application: app, title: 'Clipboard Popup Test Client', child: entry});
    exported = Gio.DBusExportedObject.wrapJSObject(
        '<node><interface name="org.example.ClipboardPopupTest"><method name="GetText"><arg type="s" direction="out"/></method><method name="Reset"/><method name="CheckPreferences"><arg type="b" direction="out"/></method></interface></node>', {
            GetText() { return entry.text; },
            Reset() { entry.text = ''; entry.grab_focus(); },
            async CheckPreferencesAsync(_params, invocation) {
                try {
                    Gio.resources_register(Gio.Resource.load('/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource'));
                    const dir = Gio.File.new_for_path(GLib.getenv('CLIPBOARD_TEST_EXTENSION'));
                    const metadata = JSON.parse(new TextDecoder().decode(dir.get_child('metadata.json').load_contents(null)[1]));
                    const {default: Preferences} = await import(dir.get_child('prefs.js').get_uri());
                    const preferences = new Preferences({...metadata, dir, path: dir.get_path()});
                    const {extensionManager} = await import('resource:///org/gnome/Shell/Extensions/js/extensionsService.js');
                    const extension = extensionManager.createExtensionObject({
                        uuid: new GLib.Variant('s', metadata.uuid),
                        path: new GLib.Variant('s', dir.get_path()),
                    });
                    extension.stateObj = preferences;
                    Adw.init();
                    prefsWindow = new Adw.PreferencesWindow();
                    preferences.fillPreferencesWindow(prefsWindow);
                    prefsWindow.present();
                    checkShortcuts(preferences, prefsWindow);
                    prefsWindow = null;
                    extension.stateObj = null;
                    invocation.return_value(new GLib.Variant('(b)', [true]));
                } catch (error) {
                    invocation.return_dbus_error('org.example.ClipboardPopupTest.Error', error.message);
                }
            },
        });
    exported.export(app.get_dbus_connection(), '/test');
    window.present();
    entry.grab_focus();
});
app.connect('shutdown', () => {
    exported?.unexport();
    prefsWindow?.destroy();
});
app.run([]);

function checkShortcuts(preferences, window) {
    const settings = preferences.getSettings();
    const keys = ['popup-shortcut', 'next-entry', 'prev-entry', 'toggle-private-mode', 'clear-history'];
    const original = keys.map(key => settings.get_strv(key));
    let dialog;
    const assert = (condition, message) => {
        if (!condition)
            throw new Error(message);
    };
    const findWidget = (widget, predicate) => {
        if (predicate(widget))
            return widget;
        for (let child = widget.get_first_child(); child; child = child.get_next_sibling()) {
            const found = findWidget(child, predicate);
            if (found)
                return found;
        }
        return null;
    };
    const row = findWidget(window, widget =>
        widget instanceof Adw.ActionRow && widget.title === 'Open Clipboard');
    assert(row, 'Open Clipboard has a shortcut row');
    const label = findWidget(row, widget => widget instanceof Gtk.ShortcutLabel);
    const clearButton = findWidget(row, widget =>
        widget instanceof Gtk.Button && widget.tooltip_text === 'Remove shortcut');
    assert(label && clearButton, 'shortcut row has a key label and removal button');
    const open = () => {
        dialog = null;
        row.emit('activated');
        const windows = Gtk.Window.get_toplevels();
        for (let i = 0; i < windows.get_n_items(); i++) {
            const candidate = windows.get_item(i);
            if (candidate.transient_for === window)
                dialog = candidate;
        }
        assert(dialog, 'shortcut editor opens as a transient window');
        const controllers = dialog.observe_controllers();
        for (let i = 0; i < controllers.get_n_items(); i++) {
            const controller = controllers.get_item(i);
            if (controller instanceof Gtk.EventControllerKey &&
                controller.propagation_phase === Gtk.PropagationPhase.CAPTURE)
                return (keyval, state = 0) => controller.emit('key-pressed', keyval, 0, state);
        }
        throw new Error('shortcut editor has a capture controller');
    };
    try {
        keys.forEach(key => settings.set_strv(key, []));
        settings.set_strv('next-entry', ['<Control><Alt>k']);
        const modifiers = Gdk.ModifierType.CONTROL_MASK | Gdk.ModifierType.ALT_MASK;
        let press = open();
        press(Gdk.KEY_a);
        press(Gdk.KEY_Control_L, Gdk.ModifierType.CONTROL_MASK);
        assert(settings.get_strv(keys[0]).length === 0, 'bare keys and modifiers are ignored');
        press(Gdk.KEY_k, modifiers);
        assert(settings.get_strv(keys[0]).length === 0, 'duplicate shortcuts are rejected');
        const body = dialog.content.get_last_child();
        const hint = body.get_first_child().get_next_sibling();
        assert(hint.label.includes('Next Entry'), 'duplicate shortcut explains which action uses it');
        press(Gdk.KEY_Escape);
        assert(settings.get_strv(keys[0]).length === 0, 'Escape cancels without changing the shortcut');

        press = open();
        press(Gdk.KEY_B, modifiers | Gdk.ModifierType.SHIFT_MASK);
        const expected = Gtk.accelerator_name(Gdk.KEY_b, modifiers | Gdk.ModifierType.SHIFT_MASK);
        assert(settings.get_strv(keys[0])[0] === expected, 'captured shortcuts normalize letter case');
        press = open();
        press(Gdk.KEY_Escape);
        assert(settings.get_strv(keys[0])[0] === expected, 'cancelling preserves an existing shortcut');
        press = open();
        press(Gdk.KEY_BackSpace);
        assert(settings.get_strv(keys[0]).length === 0, 'Backspace removes a shortcut');
        press = open();
        press(Gdk.KEY_v, Gdk.ModifierType.SUPER_MASK);
        assert(settings.get_strv(keys[0])[0] === '<Super>v', 'Super+V can be captured');
        assert(label.accelerator === '<Super>v' && clearButton.sensitive, 'row reflects the assigned shortcut');
        clearButton.emit('clicked');
        assert(settings.get_strv(keys[0]).length === 0 && label.accelerator === '' &&
            !clearButton.sensitive, 'removal button clears the shortcut and updates the row');

        open();
        window.destroy();
        const remaining = Gtk.Window.get_toplevels();
        for (let i = 0; i < remaining.get_n_items(); i++)
            assert(remaining.get_item(i) !== dialog, 'destroying preferences also destroys the shortcut editor');
        dialog = null;
        print('PASS preferences shortcut activation, capture, validation, removal, and window cleanup');
    } finally {
        dialog?.destroy();
        keys.forEach((key, i) => settings.set_strv(key, original[i]));
    }
}
