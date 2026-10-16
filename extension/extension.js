import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {History} from './history.js';
import {showOsd, setClipboardEntry, cycleEntry, togglePrivateMode, sendPaste, syncPrivateIcon} from './actions.js';
import {rebuildMenu, releaseMenu} from './menu.js';

const CLIP = St.ClipboardType.CLIPBOARD;
const PASTE_DELAY_MS = 60;

export default class ClipboardPopupExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._history = new History();
        this._suppressCapture = false;

        // Invisible anchor moved to the pointer so the menu opens like a context menu.
        this._anchor = new St.Widget({reactive: false, opacity: 0, width: 1, height: 1});
        Main.uiGroup.add_child(this._anchor);

        this._menu = new PopupMenu.PopupMenu(this._anchor, 0.5, St.Side.TOP);
        Main.uiGroup.add_child(this._menu.actor);
        this._menu.actor.hide();
        this._indicator = new PanelMenu.Button(0, this.metadata.name, true);
        this._indicatorIcon = new St.Icon({style_class: 'system-status-icon'});
        this._indicator.add_child(this._indicatorIcon);
        this._indicatorSignalId = this._indicator.connect('button-press-event', (_a, event) => {
            if (event.get_button() === 3) {
                togglePrivateMode(this);
                return Clutter.EVENT_STOP;
            }
            this._openPopup();
            return Clutter.EVENT_STOP;
        });
        Main.panel.addToStatusArea(this.uuid, this._indicator);
        this._privateSignalId = this._settings.connect('changed::private-mode',
            () => syncPrivateIcon(this));
        syncPrivateIcon(this);
        this._menuSignalId = this._menu.connect('open-state-changed', (_m, open) => {
            if (!open)
                this._parkAnchor();
        });
        this._timeoutIds = new Set();

        this._selectionSignalId = this._connectSelectionSignal();
        this._trimSignalId = this._settings.connect('changed::history-size',
            () => this._history.trim(this._settings.get_int('history-size')));
        this._onlyPinnedSignalId = this._settings.connect('changed::cache-only-favorites',
            () => (this._history.onlyPinned = this._settings.get_boolean('cache-only-favorites')));
        this._history.onlyPinned = this._settings.get_boolean('cache-only-favorites');
        this._cycleIndex = null;

        this._handlers = {
            'popup-shortcut': () => this._openPopup(),
            'next-entry': () => cycleEntry(this, 1),
            'prev-entry': () => cycleEntry(this, -1),
            'toggle-private-mode': () => togglePrivateMode(this),
        };
        this._keybindings = Object.keys(this._handlers);
        for (const key of this._keybindings)
            Main.wm.addKeybinding(key, this._settings, Meta.KeyBindingFlags.NONE,
                Shell.ActionMode.NORMAL, this._handlers[key]);
    }

    disable() {
        for (const key of this._keybindings ?? [])
            Main.wm.removeKeybinding(key);
        this._keybindings = null;
        this._handlers = null;
        if (this._onlyPinnedSignalId)
            this._settings?.disconnect(this._onlyPinnedSignalId);
        this._onlyPinnedSignalId = 0;
        if (this._selectionSignalId)
            this._selection?.disconnect(this._selectionSignalId);
        this._selectionSignalId = 0;
        this._selection = null;
        if (this._trimSignalId)
            this._settings?.disconnect(this._trimSignalId);
        this._trimSignalId = 0;
        for (const id of this._timeoutIds ?? [])
            GLib.Source.remove(id);
        this._timeoutIds?.clear();
        this._timeoutIds = null;
        if (this._menuSignalId)
            this._menu?.disconnect(this._menuSignalId);
        this._menuSignalId = 0;
        if (this._privateSignalId)
            this._settings?.disconnect(this._privateSignalId);
        this._privateSignalId = 0;
        if (this._indicatorSignalId)
            this._indicator?.disconnect(this._indicatorSignalId);
        this._indicatorSignalId = 0;
        this._indicatorIcon?.destroy();
        this._indicatorIcon = null;
        this._indicator?.destroy();
        this._indicator = null;
        releaseMenu(this);
        this._menu?.destroy();
        this._menu = null;
        this._anchor?.destroy();
        this._anchor = null;
        this._history?.finalize();
        this._history = null;
        this._device = null;
        this._settings = null;
    }

    _later(ms, fn) {
        if (!this._timeoutIds)
            return;
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            this._timeoutIds.delete(id);
            fn();
            return GLib.SOURCE_REMOVE;
        });
        this._timeoutIds.add(id);
    }

    _connectSelectionSignal() {
        try {
            this._selection = global.display.get_selection();
            return this._selection.connect('owner-changed',
                (_sel, selType) => this._onSelectionChanged(selType));
        } catch (e) {
            console.error(`clipboard-popup: no selection signal: ${e.message}`);
            return 0;
        }
    }

    _onSelectionChanged(selType) {
        if (selType !== Meta.SelectionType.SELECTION_CLIPBOARD || this._suppressCapture ||
            this._settings.get_boolean('private-mode'))
            return;
        const clipboard = St.Clipboard.get_default();
        // Skip secrets flagged by password managers.
        if ((clipboard.get_mimetypes(CLIP) ?? []).includes('x-kde-passwordManagerHint'))
            return;
        clipboard.get_text(CLIP, (_cb, text) => {
            if (!this._history)
                return;
            if (this._settings.get_boolean('strip-text') && text)
                text = text.trim();
            if (text && text.trim()) {
                const entry = this._history.addText(text);
                if (entry) {
                    this._cycleIndex = null;
                    this._history.trim(this._settings.get_int('history-size'));
                    if (this._settings.get_boolean('notify-on-copy'))
                        showOsd('edit-copy-symbolic', _('Copied to history'));
                }
                return;
            }
            clipboard.get_content(CLIP, 'image/png', (_cb2, bytes) => {
                if (bytes && this._history) {
                    if (this._history.addImage(bytes)) {
                        this._cycleIndex = null;
                        this._history.trim(this._settings.get_int('history-size'));
                        if (this._settings.get_boolean('notify-on-copy'))
                            showOsd('image-x-generic-symbolic', _('Image copied to history'));
                    }
                }
            });
        });
    }

    _openPopup() {
        const [x, y] = global.get_pointer();
        this._anchor.set_position(Math.max(0, x), Math.max(0, y));
        rebuildMenu(this);
        this._menu.open();
    }

    _selectEntry(entry) {
        const clipboard = St.Clipboard.get_default();
        this._suppressCapture = true;
        this._later(PASTE_DELAY_MS * 4, () => {
            this._suppressCapture = false;
        });
        if (this._settings.get_boolean('move-item-first'))
            this._history.moveFirst(entry.id);

        setClipboardEntry(entry, clipboard);

        if (this._settings.get_boolean('paste-on-select'))
            this._later(PASTE_DELAY_MS, () => sendPaste(this));
    }

    _parkAnchor() {
        // keep anchor parked offscreen so it never catches input
        this._anchor.set_position(-1, -1);
    }
}
