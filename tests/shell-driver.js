import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}

export default class Driver extends Extension {
    enable() {
        this._timers = new Set();
        this._later(2500, () => this._run().catch(error => {
            console.error(`CLIPBOARD_SMOKE_FAIL: ${error.message}\n${error.stack}`);
            global.context.terminate();
        }));
    }

    _later(ms, fn) {
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            this._timers.delete(id);
            fn();
            return GLib.SOURCE_REMOVE;
        });
        this._timers.add(id);
    }

    _wait(ms = 150) {
        return new Promise(resolve => this._later(ms, resolve));
    }

    _client(method, signature = '()') {
        return new Promise((resolve, reject) => {
            Gio.DBus.session.call('org.example.ClipboardPopupTest', '/test',
                'org.example.ClipboardPopupTest', method, null, new GLib.VariantType(signature),
                Gio.DBusCallFlags.NONE, 5000, null, (connection, result) => {
                    try {
                        resolve(connection.call_finish(result).deep_unpack());
                    } catch (error) {
                        reject(error);
                    }
                });
        });
    }

    async _run() {
        const extension = Main.extensionManager.lookup('clipboard-popup@imshaaz21.github.com');
        const ext = extension?.stateObj;
        assert(ext?._settings, 'extension enabled');
        await ext._history.ready;
        assert(ext._history.isReady, 'history loaded');
        Main.overview.hide();
        await this._wait(500);
        assert(Main.modalCount === 0, `test desktop must be unobstructed: ${Main.modalActorFocusStack.map(r => String(r.actor)).join(', ')}`);
        const clipboard = St.Clipboard.get_default();
        clipboard.set_text(St.ClipboardType.CLIPBOARD, 'native capture test');
        await this._wait();
        assert(ext._history.entries[0]?.text === 'native capture test', 'native bounded clipboard capture');
        ext._settings.set_boolean('process-primary-selection', true);
        clipboard.set_text(St.ClipboardType.PRIMARY, 'primary capture test');
        await this._wait();
        assert(ext._history.entries[0]?.text === 'primary capture test', 'native PRIMARY capture');
        ext._settings.set_boolean('process-primary-selection', false);
        const window = global.get_window_actors().map(actor => actor.meta_window)
            .find(w => w.get_title() === 'Clipboard Popup Test Client');
        assert(window, 'GTK test client exists');
        window.activate(global.get_current_time());
        await this._wait();
        ext._settings.set_strv('excluded-apps', ['org.example.ClipboardPopupTest.desktop']);
        clipboard.set_text(St.ClipboardType.CLIPBOARD, 'excluded app secret');
        await this._wait();
        assert(!ext._history.entries.some(e => e.text === 'excluded app secret'), 'app exclusion');
        ext._settings.set_strv('excluded-apps', []);
        ext._settings.set_boolean('private-mode', true);
        clipboard.set_text(St.ClipboardType.CLIPBOARD, 'must not record');
        await this._wait();
        assert(!ext._history.entries.some(e => e.text === 'must not record'), 'private mode');
        ext._settings.set_boolean('private-mode', false);
        ext._settings.set_int('history-size', 100);
        ext._settings.set_int('max-displayed-entries', 10);
        for (let i = 0; i < 30; i++)
            ext._history.addText(`search target ${i}`);
        const image = new GLib.Bytes(GLib.base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX+XDSwAAAABJRU5ErkJggg=='));
        clipboard.set_content(St.ClipboardType.CLIPBOARD, 'image/png', image);
        await this._wait();
        assert(ext._history.entries[0].kind === 'image', 'native PNG capture');
        ext._openPopup();
        await this._wait();
        assert(ext._menu.isOpen, 'popup opens with a modal grab');
        assert(ext._popupView._rows.length === 10, 'display limit');
        ext._popupView._search.text = 'search target 0';
        assert(ext._popupView._rows.length === 1, 'search finds old entries outside display limit');
        const entry = ext._popupView._rows[0].entry;
        ext._history.togglePin(entry.id);
        assert(ext._popupView._rows[0].entry.pinned, 'pin refresh');
        ext._selectEntry(entry, false);
        await this._wait();
        assert(!ext._menu.isOpen, 'selection closes popup');
        assert(ext._history.entries.filter(e => e.text === entry.text).length === 1, 'selection is not recaptured');
        ext._indicator.menu.open();
        await this._wait();
        assert(ext._panelView._rows.length === 10, 'panel menu is bounded');
        ext._indicator.menu.close();
        const actions = await import(Gio.File.new_for_path(extension.path).get_child('actions.js').get_uri());
        actions.previewEntry(ext, entry);
        await this._wait();
        assert(ext._dialog, 'preview dialog opens');
        actions.closeDialog(ext);
        actions.confirmClear(ext);
        await this._wait();
        assert(ext._dialog && ext._history.entries.length > 1, 'clear requires confirmation');
        await ext._history.whenSaved();
        ext.disable();
        assert(Main.modalCount === 0, 'disable releases every modal grab');
        assert(ext._menu === null && ext._dialog === null && ext._signals === null && ext._timeoutIds === null,
            'disable cleans UI, signals, timers, and pending work');
        ext.enable();
        await ext._history.ready;
        assert(ext._history.entries.some(e => e.text === entry.text && e.pinned), 'reenable restores favorites');
        window.activate(global.get_current_time());
        await this._wait();
        await this._client('Reset');
        ext._openPopup(); await this._wait();
        const restored = ext._history.entries.find(e => e.text === entry.text);
        const serial = ext._selectionSerial;
        ext._selectEntry(restored, true);
        await this._wait(800);
        const pasteState = {device: !!ext._device, serialBefore: serial, serialAfter: ext._selectionSerial,
            focus: String(global.stage.get_key_focus()), target: global.display.focus_window === window,
            modifiers: global.get_pointer()[2]};
        const pasted = (await this._client('GetText', '(s)'))[0];
        assert(pasted === entry.text,
            `native Ctrl+V paste into GTK entry: ${JSON.stringify({...pasteState, pasted})}`);
        assert((await this._client('CheckPreferences', '(b)'))[0], 'preferences construct with current schema');
        ext._indicator.menu.open();
        const panel = ext._panelView;
        panel._search.text = 'no entries match this query';
        assert(panel._rows.length === 0 && panel._search.get_parent().visible,
            'search stays available when a query has no matches');
        for (const item of [...ext._history.entries])
            ext._history.remove(item.id);
        assert(!panel._search.get_parent().visible && panel._search.text === '',
            'empty panel history hides the search row and resets its query');
        ext._history.addText('first entry after clearing');
        assert(panel._search.get_parent().visible && panel._rows.length === 1,
            'search returns when history receives a new entry');
        ext._indicator.menu.close();
        await ext._history.whenSaved();
        ext.disable();
        await this._wait();
        print('CLIPBOARD_SMOKE_PASS');
        GLib.file_set_contents(GLib.build_filenamev([GLib.get_user_cache_dir(), 'smoke-passed']), 'passed');
        global.context.terminate();
    }

    disable() {
        for (const id of this._timers ?? [])
            GLib.Source.remove(id);
        this._timers = null;
    }
}
