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
import {Capture, excludedApplication} from './capture.js';
import {
    showOsd, setClipboardEntry, cycleEntry, togglePrivateMode, sendPaste, preparePaste,
    syncPrivateIcon, trackCaret, untrackCaret, confirmClear, closeDialog,
} from './actions.js';
import {rebuildMenu, rebuildPanelMenu, releaseMenu} from './menu.js';

// How long an owner-changed echo of our own selection is ignored.
const OWN_SELECTION_ECHO_US = 500000;

export default class ClipboardPopupExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._signals = [];
        this._timeoutIds = new Set();
        this._session = {};
        this._settingClipboard = false;
        this._selectionSerial = 0;
        this._ownSelectionUntil = 0;
        this._cycleIndex = null;
        this._favoritesOnly = false;
        if (this._settings.get_boolean('paste-on-select'))
            preparePaste(this);
        this._history = new History(this._historyOptions());
        this._history.onChanged = () => this._refreshMenus();
        this._history.onError = () => {
            if (!this._storageErrorShown) {
                this._storageErrorShown = true;
                showOsd('dialog-warning-symbolic', _('Clipboard history could not be saved or loaded'));
            }
        };

        // Invisible anchor moved to the pointer so the menu opens like a context menu.
        this._anchor = new St.Widget({reactive: false, opacity: 0, width: 1, height: 1});
        Main.uiGroup.add_child(this._anchor);
        this._menu = new PopupMenu.PopupMenu(this._anchor, 0.5, St.Side.TOP);
        Main.uiGroup.add_child(this._menu.actor);
        this._menu.actor.hide();
        this._popupManager = Main.panel.menuManager;
        this._popupManager.addMenu(this._menu);
        this._connect(this._menu, 'open-state-changed', (_menu, open) => {
            if (!open)
                this._parkAnchor();
        });

        this._indicator = new PanelMenu.Button(0, this.metadata.name);
        this._indicatorIcon = new St.Icon({style_class: 'system-status-icon'});
        this._indicator.add_child(this._indicatorIcon);
        this._connect(this._indicator, 'button-press-event', (_actor, event) => {
            if (event.get_button() !== 3)
                return Clutter.EVENT_PROPAGATE;
            togglePrivateMode(this);
            return Clutter.EVENT_STOP;
        });
        this._connect(this._indicator.menu, 'open-state-changed', (_menu, open) => {
            if (open) {
                this._menu.close();
                this._targetWindow = global.display.focus_window;
                rebuildPanelMenu(this);
            }
        });
        Main.panel.addToStatusArea(this.uuid, this._indicator);
        syncPrivateIcon(this);
        trackCaret(this);

        this._selection = global.display.get_selection();
        this._capture = new Capture(this._selection,
            type => this._canCapture(type), (kind, value) => this._record(kind, value));
        this._connectSelectionSignal();
        this._connect(global.display, 'notify::focus-window', () => {
            this._capture.cancel();
            this._selectionSerial++;
            this._caretPos = null;
        });
        this._connect(this._settings, 'changed', (_settings, key) => this._settingsChanged(key));
        this._handlers = {
            'popup-shortcut': () => this._openPopup(),
            'next-entry': () => cycleEntry(this, 1),
            'prev-entry': () => cycleEntry(this, -1),
            'toggle-private-mode': () => togglePrivateMode(this),
            'clear-history': () => confirmClear(this),
        };
        this._boundKeys = [];
        this._bindKeybindings();
        this._scheduleExpiry();
        rebuildPanelMenu(this);
        const session = this._session;
        this._history.ready.then(() => {
            if (this._session === session && this._history.isReady)
                this._capture.changed(Meta.SelectionType.SELECTION_CLIPBOARD);
        });
    }

    disable() {
        this._session = null;
        this._capture?.destroy();
        this._capture = null;
        for (const key of this._boundKeys ?? [])
            Main.wm.removeKeybinding(key);
        this._boundKeys = null;
        this._handlers = null;
        for (const [object, id] of this._signals ?? [])
            object.disconnect(id);
        this._signals = null;
        this._cancelExpiry();
        for (const id of this._timeoutIds ?? [])
            GLib.Source.remove(id);
        this._timeoutIds = null;
        this._expiryId = 0;
        untrackCaret(this);
        closeDialog(this);
        this._menu?.close();
        this._indicator?.menu.close();
        releaseMenu(this);
        if (this._menu)
            this._popupManager?.removeMenu(this._menu);
        this._popupManager = null;
        this._menu?.destroy();
        this._menu = null;
        this._indicatorIcon?.destroy();
        this._indicatorIcon = null;
        this._indicator?.destroy();
        this._indicator = null;
        this._anchor?.destroy();
        this._anchor = null;
        this._history?.finalize();
        this._history = null;
        this._selection = null;
        this._device = null;
        this._settings = null;
        this._targetWindow = null;
        this._cycleIndex = null;
        this._storageErrorShown = false;
        this._settingClipboard = false;
        this._selectionSerial = 0;
        this._favoritesOnly = false;
    }

    _connect(object, signal, handler) {
        this._signals.push([object, object.connect(signal, handler)]);
    }

    _later(ms, fn) {
        if (!this._timeoutIds)
            return 0;
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            this._timeoutIds.delete(id);
            fn();
            return GLib.SOURCE_REMOVE;
        });
        this._timeoutIds.add(id);
    }

    _refreshMenus() {
        if (this._menu?.isOpen)
            this._popupView?.refresh();
        if (this._indicator?.menu.isOpen)
            this._panelView?.refresh();
    }

    _historyOptions() {
        return {
            maxEntries: this._settings.get_int('history-size'),
            maxBytes: this._settings.get_int('cache-size') * 1024 * 1024,
            maxAgeMs: this._settings.get_int('expire-hours') * 3600000,
            onlyPinned: this._settings.get_boolean('cache-only-favorites'),
        };
    }

    _settingsChanged(key) {
        this._capture.cancel();
        this._selectionSerial++;
        if (['history-size', 'cache-size', 'expire-hours', 'cache-only-favorites'].includes(key)) {
            this._history.configure(this._historyOptions());
            this._scheduleExpiry();
        }
        if (key === 'enable-keybindings' || Object.hasOwn(this._handlers, key))
            this._bindKeybindings();
        if (key === 'private-mode')
            syncPrivateIcon(this);
        if (key === 'paste-on-select' && this._settings.get_boolean(key))
            preparePaste(this);
        this._menu.close();
        this._indicator.menu.close();
    }

    _cancelExpiry() {
        if (this._expiryId) {
            GLib.Source.remove(this._expiryId);
            this._expiryId = 0;
        }
    }

    _scheduleExpiry() {
        this._cancelExpiry();
        if (this._settings.get_int('expire-hours') > 0) {
            this._expiryId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, () => {
                this._history.trim();
                this._refreshMenus();
                return GLib.SOURCE_CONTINUE;
            });
        }
    }

    _connectSelectionSignal() {
        this._connect(this._selection, 'owner-changed', (_selection, type) => this._ownerChanged(type));
    }

    _ownerChanged(type) {
        // XWayland re-announces our own selection a moment after we set it; that
        // echo must not cancel the paste that follows the pick.
        if (type === Meta.SelectionType.SELECTION_CLIPBOARD &&
            GLib.get_monotonic_time() >= this._ownSelectionUntil)
            this._selectionSerial++;
        this._capture.changed(type);
    }

    _canCapture(type) {
        if (!this._history?.isReady || this._settingClipboard ||
            this._settings.get_boolean('private-mode') || Main.sessionMode.isLocked)
            return false;
        if (type === Meta.SelectionType.SELECTION_PRIMARY &&
            !this._settings.get_boolean('process-primary-selection'))
            return false;
        // Skip secrets flagged by password managers in both clipboard selections.
        const window = global.display.focus_window;
        const app = window ? Shell.WindowTracker.get_default().get_window_app(window) : null;
        return !excludedApplication(this._settings.get_strv('excluded-apps'),
            [app?.get_id(), window?.get_wm_class()]);
    }

    _record(kind, value) {
        if (kind === 'text' && this._settings.get_boolean('strip-text'))
            value = value.trim();
        const entry = kind === 'text' ? this._history.addText(value) : this._history.addImage(value);
        if (!entry)
            return;
        this._cycleIndex = null;
        if (this._settings.get_boolean('notify-on-copy'))
            showOsd('edit-copy-symbolic', _('Copied to history'));
    }

    _bindKeybindings() {
        for (const key of this._boundKeys)
            Main.wm.removeKeybinding(key);
        this._boundKeys = [];
        if (!this._settings.get_boolean('enable-keybindings'))
            return;
        for (const [key, handler] of Object.entries(this._handlers)) {
            if (!this._settings.get_strv(key).length)
                continue;
            if (Main.wm.addKeybinding(key, this._settings, Meta.KeyBindingFlags.NONE,
                Shell.ActionMode.NORMAL, handler) !== Meta.KeyBindingAction.NONE)
                this._boundKeys.push(key);
        }
    }

    _openPopup() {
        if (this._menu.isOpen) {
            this._menu.close();
            return;
        }
        this._indicator.menu.close();
        const [x, y] = global.get_pointer();
        let px = x, py = y;
        const focus = global.display.focus_window;
        this._targetWindow = focus;
        if (focus) {
            const frame = focus.get_frame_rect();
            const caret = this._caretPos;
            if (caret?.window === focus && caret.frameX === frame.x && caret.frameY === frame.y &&
                caret.x >= frame.x && caret.x <= frame.x + frame.width &&
                caret.y >= frame.y && caret.y + caret.height <= frame.y + frame.height) {
                px = caret.x;
                py = caret.y + caret.height + 4;
            } else if (x < frame.x || x > frame.x + frame.width || y < frame.y || y > frame.y + frame.height) {
                px = frame.x + Math.round(frame.width / 2);
                py = frame.y + Math.round(frame.height / 4);
            }
        }
        const monitor = Main.layoutManager.monitors.find(m =>
            px >= m.x && px < m.x + m.width && py >= m.y && py < m.y + m.height) ??
            Main.layoutManager.primaryMonitor;
        if (!monitor)
            return;
        this._anchor.set_position(
            Math.max(monitor.x, Math.min(px, monitor.x + monitor.width - 1)),
            Math.max(monitor.y, Math.min(py, monitor.y + monitor.height - 1)));
        this._history.trim();
        rebuildMenu(this);
        this._menu.open();
    }

    _selectEntry(entry, paste = this._settings.get_boolean('paste-on-select'), reorder = true) {
        if (!this._history.entries.some(e => e.id === entry.id))
            return;
        const target = this._targetWindow;
        this._menu.close();
        this._indicator.menu.close();
        this._capture.cancel();
        this._ownSelectionUntil = GLib.get_monotonic_time() + OWN_SELECTION_ECHO_US;
        this._settingClipboard = true;
        try {
            setClipboardEntry(entry, St.Clipboard.get_default());
        } finally {
            this._settingClipboard = false;
        }
        if (reorder && this._settings.get_boolean('move-item-first'))
            this._history.moveFirst(entry.id);
        if (paste && target)
            this._waitToPaste(target, this._selectionSerial, 0);
    }

    _waitToPaste(target, serial, attempt) {
        this._later(25, () => {
            // Gone for good: another window or clipboard owner, or a locked session.
            if (global.display.focus_window !== target || serial !== this._selectionSerial ||
                Main.sessionMode.isLocked)
                return;
            const modifiers = global.get_pointer()[2] &
                (Clutter.ModifierType.SHIFT_MASK | Clutter.ModifierType.CONTROL_MASK |
                 Clutter.ModifierType.MOD1_MASK | Clutter.ModifierType.SUPER_MASK);
            // Transient: the menu is still closing, a modal is up, or a key is held.
            if (modifiers || global.stage.get_key_focus() || this._menu.isOpen ||
                this._indicator.menu.isOpen || this._dialog || Main.modalCount > 0 ||
                Main.overview.visible) {
                if (attempt < 20)
                    this._waitToPaste(target, serial, attempt + 1);
                else
                    showOsd('dialog-warning-symbolic', _('Copied. Paste manually.'));
                return;
            }
            sendPaste(this);
        });
    }

    _parkAnchor() {
        // keep anchor parked offscreen so it never catches input
        this._anchor.set_position(-1, -1);
    }
}
