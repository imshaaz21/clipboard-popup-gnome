import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {History} from './history.js';

const CLIP = St.ClipboardType.CLIPBOARD;
const PASTE_DELAY_MS = 60;

export default class ClipboardPopupExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._history = new History();
        this._suppressCapture = false;

        // Invisible anchor the popup menu is positioned against; moved to the
        // pointer each time the hotkey fires so the menu opens like a context menu.
        this._anchor = new St.Widget({reactive: false, opacity: 0, width: 1, height: 1});
        Main.uiGroup.add_child(this._anchor);

        this._menu = new PopupMenu.PopupMenu(this._anchor, 0.5, St.Side.TOP);
        Main.uiGroup.add_child(this._menu.actor);
        this._menu.actor.hide();
        this._menuSignalId = this._menu.connect('open-state-changed', (_m, open) => {
            if (!open)
                this._parkAnchor();
        });
        this._timeoutIds = new Set();

        this._selectionSignalId = this._connectSelectionSignal();
        this._trimSignalId = this._settings.connect('changed::history-size',
            () => this._history.trim(this._settings.get_int('history-size')));

        Main.wm.addKeybinding('popup-shortcut', this._settings, Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL, () => this._openPopup());
    }

    disable() {
        Main.wm.removeKeybinding('popup-shortcut');
        if (this._selectionSignalId)
            global.display.disconnect(this._selectionSignalId);
        this._selectionSignalId = 0;
        if (this._trimSignalId)
            this._settings.disconnect(this._trimSignalId);
        this._trimSignalId = 0;
        for (const id of this._timeoutIds)
            GLib.Source.remove(id);
        this._timeoutIds.clear();
        this._timeoutIds = null;
        if (this._menuSignalId)
            this._menu.disconnect(this._menuSignalId);
        this._menuSignalId = 0;
        this._menu.destroy();
        this._menu = null;
        this._anchor.destroy();
        this._anchor = null;
        this._history.save();
        this._history = null;
        this._device = null;
        this._settings = null;
    }

    _later(ms, fn) {
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            this._timeoutIds.delete(id);
            fn();
            return GLib.SOURCE_REMOVE;
        });
        this._timeoutIds.add(id);
    }

    _connectSelectionSignal() {
        try {
            return global.display.connect('selection-owner-changed',
                (_display, selType) => this._onSelectionChanged(selType));
        } catch (e) {
            console.error(`clipboard-popup: no selection signal: ${e.message}`);
            return 0;
        }
    }

    _onSelectionChanged(selType) {
        if (selType !== Meta.SelectionType.SELECTION_CLIPBOARD || this._suppressCapture)
            return;
        const clipboard = St.Clipboard.get_default();
        // Skip secrets flagged by password managers.
        if ((clipboard.get_mimetypes(CLIP) ?? []).includes('x-kde-passwordManagerHint'))
            return;
        clipboard.get_text(CLIP, (_cb, text) => {
            if (!this._history)
                return;
            if (text && text.trim()) {
                const entry = this._history.addText(text);
                if (entry)
                    this._history.trim(this._settings.get_int('history-size'));
                return;
            }
            // Not text - try an image.
            clipboard.get_content(CLIP, 'image/png', (_cb2, bytes) => {
                if (bytes && this._history) {
                    if (this._history.addImage(bytes))
                        this._history.trim(this._settings.get_int('history-size'));
                }
            });
        });
    }

    _openPopup() {
        const [x, y] = global.get_pointer();
        this._anchor.set_position(Math.max(0, x), Math.max(0, y));
        this._rebuildMenu();
        this._menu.open();
    }

    _rebuildMenu() {
        this._menu.removeAll();

        if (this._history.entries.length === 0) {
            const empty = new PopupMenu.PopupMenuItem(_('Clipboard history is empty'), {reactive: false});
            this._menu.addMenuItem(empty);
        } else {
            for (const entry of this._history.entries)
                this._menu.addMenuItem(this._makeEntryItem(entry));
        }

        this._menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const clearItem = new PopupMenu.PopupMenuItem(_('Clear history (keeps pinned)'));
        clearItem.connect('activate', () => this._history.clear());
        this._menu.addMenuItem(clearItem);
    }

    _makeEntryItem(entry) {
        const item = new PopupMenu.PopupBaseMenuItem();

        if (entry.kind === 'image') {
            item.add_child(new St.Icon({
                gicon: Gio.FileIcon.new(Gio.File.new_for_path(entry.imageFile)),
                icon_size: 64,
            }));
        } else {
            const preview = entry.text.replace(/\s+/g, ' ');
            const max = this._settings.get_int('preview-length');
            item.add_child(new St.Label({
                text: preview.length > max ? `${preview.slice(0, max - 1)}…` : preview,
                x_expand: true,
            }));
        }

        const pinBtn = this._iconButton(entry.pinned ? 'starred-symbolic' : 'non-starred-symbolic',
            () => {
                this._history.togglePin(entry.id);
                this._rebuildMenu();
            });
        item.add_child(pinBtn);

        const delBtn = this._iconButton('window-close-symbolic',
            () => {
                this._history.remove(entry.id);
                this._rebuildMenu();
            });
        item.add_child(delBtn);

        item.connect('activate', () => this._selectEntry(entry));
        return item;
    }

    _iconButton(iconName, onClick) {
        const btn = new St.Button({
            child: new St.Icon({icon_name: iconName, icon_size: 14}),
        });
        btn.connect('clicked', onClick);
        return btn;
    }

    _selectEntry(entry) {
        const clipboard = St.Clipboard.get_default();
        this._suppressCapture = true;
        this._later(PASTE_DELAY_MS * 4, () => {
            this._suppressCapture = false;
        });

        if (entry.kind === 'image') {
            const setImage = bytes => {
                if (bytes && this._history)
                    clipboard.set_content(CLIP, 'image/png', bytes);
            };
            if (entry._bytes) {
                setImage(entry._bytes);
            } else {
                Gio.File.new_for_path(entry.imageFile).load_contents_async(null, (file, res) => {
                    try {
                        const [ok, data] = file.load_contents_finish(res);
                        setImage(ok ? new GLib.Bytes(data) : null);
                    } catch (e) {
                        console.error(`clipboard-popup: ${e.message}`);
                    }
                });
            }
        } else {
            clipboard.set_text(CLIP, entry.text);
        }

        if (this._settings.get_boolean('paste-on-select'))
            this._later(PASTE_DELAY_MS, () => this._sendPaste());
    }

    // The PowerToys trick: the item is on the clipboard, now simulate Ctrl+V in
    // whatever window had focus before the popup grabbed it.
    _sendPaste() {
        try {
            // One cached device; creating one per paste leaks.
            if (!this._device) {
                this._device = Clutter.get_default_backend().get_default_seat()
                    .create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
            }
            const device = this._device;
            const t = global.get_current_time();
            device.notify_keyval(t, Clutter.KEY_Control_L, Clutter.KeyState.PRESSED);
            device.notify_keyval(t, Clutter.KEY_v, Clutter.KeyState.PRESSED);
            device.notify_keyval(t, Clutter.KEY_v, Clutter.KeyState.RELEASED);
            device.notify_keyval(t, Clutter.KEY_Control_L, Clutter.KeyState.RELEASED);
        } catch (e) {
            console.error(`clipboard-popup: paste injection failed: ${e.message}`);
        }
    }

    _parkAnchor() {
        // keep anchor parked offscreen so it never catches input
        this._anchor.set_position(-1, -1);
    }
}
