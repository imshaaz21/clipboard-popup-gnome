import Adw from 'gi://Adw';
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
                    prefsWindow.destroy();
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
