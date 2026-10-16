import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

const CLIP = St.ClipboardType.CLIPBOARD;
const PASTE_DELAY_MS = 60;

// Evdev keycodes for Shift+Insert - the paste accelerator every app accepts, terminals included.
const KEY_SHIFT_L = 42;
const KEY_INSERT = 110;

export function showOsd(iconName, label) {
    Main.osdWindowManager.show(0, new St.Icon({icon_name: iconName}), label, null);
}

export function setClipboardEntry(entry, clipboard) {
    if (entry.kind !== 'image') {
        clipboard.set_text(CLIP, entry.text);
        return;
    }
    if (entry._bytes) {
        clipboard.set_content(CLIP, 'image/png', entry._bytes);
        return;
    }
    Gio.File.new_for_path(entry.imageFile).load_contents_async(null, (file, res) => {
        try {
            const [ok, data] = file.load_contents_finish(res);
            if (ok)
                clipboard.set_content(CLIP, 'image/png', new GLib.Bytes(data));
        } catch (e) {
            console.error(`clipboard-popup: ${e.message}`);
        }
    });
}

export function cycleEntry(ext, dir) {
    const entries = ext._history.entries;
    if (entries.length === 0)
        return;
    ext._cycleIndex = ext._cycleIndex === null ? (dir > 0 ? 0 : 1) : ext._cycleIndex + dir;
    ext._cycleIndex = Math.max(0, Math.min(ext._cycleIndex, entries.length - 1));
    const entry = entries[ext._cycleIndex];
    ext._suppressCapture = true;
    ext._later(PASTE_DELAY_MS * 4, () => { ext._suppressCapture = false; });
    setClipboardEntry(entry, St.Clipboard.get_default());
    const label = entry.kind === 'image' ? _('Image')
        : entry.text.replace(/\s+/g, ' ').slice(0, ext._settings.get_int('preview-length'));
    showOsd('edit-paste-symbolic', label);
}

export function togglePrivateMode(ext) {
    const on = !ext._settings.get_boolean('private-mode');
    ext._settings.set_boolean('private-mode', on);
    showOsd('changes-prevent-symbolic', on ? _('Private mode on') : _('Private mode off'));
}

export function panelIcon(ext) {
    const name = ext._settings.get_boolean('private-mode')
        ? 'clipboard-popup-private-symbolic.svg' : 'clipboard-popup-symbolic.svg';
    const file = Gio.File.new_for_path(
        GLib.build_filenamev([ext.dir.get_path(), 'icons', name]));
    return file.query_exists(null)
        ? Gio.FileIcon.new(file)
        : Gio.ThemedIcon.new('edit-paste-symbolic');
}

export function syncPrivateIcon(ext) {
    ext._indicatorIcon.gicon = panelIcon(ext);
}

export function sendPaste(ext) {
    try {
        if (!ext._device) {
            ext._device = Clutter.get_default_backend().get_default_seat()
                .create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        }
        const device = ext._device;
        const t = Clutter.get_current_event_time() * 1000;
        device.notify_key(t, KEY_SHIFT_L, Clutter.KeyState.PRESSED);
        device.notify_key(t, KEY_INSERT, Clutter.KeyState.PRESSED);
        device.notify_key(t, KEY_INSERT, Clutter.KeyState.RELEASED);
        device.notify_key(t, KEY_SHIFT_L, Clutter.KeyState.RELEASED);
    } catch (e) {
        console.error(`clipboard-popup: paste injection failed: ${e.message}`);
    }
}
