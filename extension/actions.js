import Atspi from 'gi://Atspi';
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
    if (!ext._history || !ext._settings)
        return;
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
    if (!ext._settings)
        return;
    const on = !ext._settings.get_boolean('private-mode');
    ext._settings.set_boolean('private-mode', on);
    showOsd('changes-prevent-symbolic', on ? _('Private mode on') : _('Private mode off'));
}

export function panelIcon(ext) {
    return Gio.ThemedIcon.new(ext._settings.get_boolean('private-mode')
        ? 'view-private-symbolic' : 'edit-paste-symbolic');
}

export function syncPrivateIcon(ext) {
    if (ext._indicatorIcon && ext._settings)
        ext._indicatorIcon.gicon = panelIcon(ext);
}

export function trackCaret(ext) {
    try {
        ext._caretListener = Atspi.EventListener.new();
        ext._caretHandler = event => {
            try {
                ext._caretPos = event.source.get_character_extents(
                    event.detail1, Atspi.CoordType.SCREEN);
            } catch (e) {
                ext._caretPos = null;
            }
        };
        ext._caretListener.register_from_callback(ext._caretHandler, 'object:text-caret-moved');
    } catch (e) {
        ext._caretListener = null;
    }
}

export function untrackCaret(ext) {
    if (ext._caretListener && ext._caretHandler) {
        try {
            ext._caretListener.deregister_from_callback(ext._caretHandler, 'object:text-caret-moved');
        } catch (e) {
        }
    }
    ext._caretListener = null;
    ext._caretHandler = null;
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
