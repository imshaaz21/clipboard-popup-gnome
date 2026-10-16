import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as IBusManager from 'resource:///org/gnome/shell/misc/ibusManager.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

const CLIP = St.ClipboardType.CLIPBOARD;

// Evdev keycodes for selectable paste accelerators; application support varies.
const KEY_SHIFT_L = 42;
const KEY_INSERT = 110;
const KEY_CTRL_L = 29;
const KEY_V = 47;

export function showOsd(iconName, label) {
    Main.osdWindowManager.show(Main.layoutManager.focusIndex,
        new St.Icon({icon_name: iconName}), label, null);
}

export function setClipboardEntry(entry, clipboard) {
    if (entry.kind === 'image')
        clipboard.set_content(CLIP, 'image/png', entry._bytes);
    else
        clipboard.set_text(CLIP, entry.text);
}

export function cycleEntry(ext, dir) {
    const entries = ext._history?.entries;
    if (!entries?.length)
        return;
    ext._cycleIndex = ((ext._cycleIndex ?? 0) + dir + entries.length) % entries.length;
    ext._targetWindow = global.display.focus_window;
    ext._selectEntry(entries[ext._cycleIndex], false, false);
    showOsd('edit-paste-symbolic', _('Clipboard entry selected'));
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
    const update = (x, y, width, height) => {
        if (ext._menu?.isOpen || ext._indicator?.menu.isOpen || ext._dialog)
            return;
        const window = global.display.focus_window;
        if (!window || ![x, y, width, height].every(Number.isFinite) || height < 0)
            return;
        const frame = window.get_frame_rect();
        ext._caretPos = {window, x, y, height: Math.max(1, height), frameX: frame.x, frameY: frame.y};
    };
    ext._connect(Main.inputMethod, 'cursor-location-changed', (_method, rect) =>
        update(rect.get_x(), rect.get_y(), rect.get_width(), rect.get_height()));
    const manager = IBusManager.getIBusManager();
    ext._connect(manager, 'set-cursor-location', (_manager, rect) => {
        if (!Main.inputMethod.currentFocus)
            update(rect.x, rect.y, rect.width, rect.height);
    });
    ext._connect(manager, 'focus-out', () => { ext._caretPos = null; });
}

export function untrackCaret(ext) {
    ext._caretPos = null;
}

export function preparePaste(ext) {
    if (ext._device)
        return;
    try {
        ext._device = Clutter.get_default_backend().get_default_seat()
            .create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    } catch (e) {
        console.error('clipboard-popup: virtual keyboard unavailable');
    }
}

export function sendPaste(ext) {
    const mode = ext._settings.get_string('paste-shortcut');
    const keys = mode === 'shift-insert' ? [KEY_SHIFT_L, KEY_INSERT] : [KEY_CTRL_L, KEY_V];
    if (mode === 'ctrl-shift-v')
        keys.splice(1, 0, KEY_SHIFT_L);
    const pressed = [];
    let failure = null;
    try {
        preparePaste(ext);
        for (const key of keys) {
            ext._device.notify_key(GLib.get_monotonic_time(), key, Clutter.KeyState.PRESSED);
            pressed.push(key);
        }
    } catch (e) {
        failure = e;
    } finally {
        for (const key of pressed.reverse()) {
            try {
                ext._device.notify_key(GLib.get_monotonic_time(), key, Clutter.KeyState.RELEASED);
            } catch (e) {
                failure ??= e;
            }
        }
    }
    if (failure) {
        console.error(`clipboard-popup: paste injection failed: ${failure.message}`);
        showOsd('dialog-warning-symbolic', _('Automatic paste failed. Paste manually.'));
    }
}

export function closeDialog(ext) {
    ext._dialog?.popModal();
    ext._dialog?.destroy();
    ext._dialog = null;
}

export function confirmClear(ext) {
    const clear = () => {
        ext._capture.cancel();
        ext._history.clear();
        showOsd('edit-delete-symbolic', _('History cleared'));
    };
    if (!ext._settings.get_boolean('confirm-clear')) {
        clear();
        return;
    }
    ext._menu.close();
    ext._indicator.menu.close();
    closeDialog(ext);
    const dialog = new ModalDialog.ModalDialog();
    ext._dialog = dialog;
    dialog.contentLayout.add_child(new St.Label({text: _('Clear clipboard history?')}));
    dialog.contentLayout.add_child(new St.Label({text: _('Pinned entries will be kept. The system clipboard is unchanged.')}));
    dialog.setButtons([
        {label: _('Cancel'), key: Clutter.KEY_Escape, action: () => closeDialog(ext)},
        {label: _('Clear history'), action: () => { closeDialog(ext); clear(); }},
    ]);
    dialog.open();
}

export function previewEntry(ext, entry) {
    ext._menu.close();
    ext._indicator.menu.close();
    closeDialog(ext);
    const dialog = new ModalDialog.ModalDialog();
    ext._dialog = dialog;
    const scroll = new St.ScrollView({
        hscrollbar_policy: St.PolicyType.NEVER,
        vscrollbar_policy: St.PolicyType.AUTOMATIC,
        style: 'max-width: 640px; max-height: 480px;',
    });
    const box = new St.BoxLayout({vertical: true});
    if (scroll.set_child)
        scroll.set_child(box);
    else
        scroll.add_actor(box);
    dialog.contentLayout.add_child(scroll);
    let page = 0;
    const text = entry.text ?? '';
    const pages = text.match(/[\s\S]{1,8192}/gu) ?? [''];
    const label = new St.Label({style: 'max-width: 600px;'});
    label.clutter_text.line_wrap = true;
    label.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
    label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
    label.clutter_text.selectable = true;
    if (entry.kind === 'image')
        box.add_child(new St.Icon({gicon: Gio.BytesIcon.new(entry._bytes), icon_size: 320}));
    else
        box.add_child(label);
    const render = () => {
        label.text = pages[page];
        const buttons = [
            {label: _('Close'), key: Clutter.KEY_Escape, action: () => closeDialog(ext)},
            {label: _('Copy full entry'), action: () => { closeDialog(ext); ext._selectEntry(entry, false); }},
        ];
        if (page > 0)
            buttons.push({label: _('Previous page'), action: () => { page--; render(); }});
        if (page + 1 < pages.length)
            buttons.push({label: _('Next page'), action: () => { page++; render(); }});
        dialog.setButtons(buttons);
    };
    render();
    dialog.open();
}
