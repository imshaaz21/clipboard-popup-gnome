import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {filterEntries} from './history.js';
import {confirmClear, previewEntry, showOsd} from './actions.js';

function disconnect(signals) {
    for (const [actor, id] of signals) {
        try {
            actor.disconnect(id);
        } catch (e) {
            // actor already destroyed; nothing left to disconnect
        }
    }
    signals.length = 0;
}

class HistoryMenu {
    constructor(ext, menu, controls) {
        this._ext = ext;
        this._menu = menu;
        this._controls = controls;
        this._signals = [];
        this._rowSignals = [];
        this._rows = [];
        menu.removeAll();
        if (ext._settings.get_boolean('enable-typeahead-search')) {
            const row = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
            this._search = new St.Entry({hint_text: _('Search all history'), x_expand: true, can_focus: true});
            row.add_child(this._search);
            menu.addMenuItem(row);
            this._connect(this._search.clutter_text, 'text-changed', () => this.refresh());
        }
        const favorites = new PopupMenu.PopupSwitchMenuItem(_('Favorites only'), ext._favoritesOnly);
        this._favorites = favorites;
        this._connect(favorites, 'toggled', () => {
            ext._favoritesOnly = favorites.state;
            this.refresh();
        });
        menu.addMenuItem(favorites);
        const scroll = new St.ScrollView({
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            overlay_scrollbars: true,
            style: 'max-height: 480px; max-width: 640px;',
        });
        this._section = new PopupMenu.PopupMenuSection();
        if (scroll.set_child)
            scroll.set_child(this._section.actor);
        else
            scroll.add_actor(this._section.actor);
        const wrapper = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
        wrapper.add_child(scroll);
        menu.addMenuItem(wrapper);
        this._status = new PopupMenu.PopupMenuItem('', {reactive: false});
        menu.addMenuItem(this._status);
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        if (controls) {
            const privateItem = new PopupMenu.PopupSwitchMenuItem(_('Private mode'), ext._settings.get_boolean('private-mode'));
            this._connect(privateItem, 'toggled', () => ext._settings.set_boolean('private-mode', privateItem.state));
            menu.addMenuItem(privateItem);
            const preferences = new PopupMenu.PopupMenuItem(_('Preferences'));
            this._connect(preferences, 'activate', () => { menu.close(); ext.openPreferences(); });
            menu.addMenuItem(preferences);
        }
        const clear = new PopupMenu.PopupMenuItem(_('Clear history (keeps pinned)'));
        this._connect(clear, 'activate', () => confirmClear(ext));
        menu.addMenuItem(clear);
        this._connect(menu.actor, 'captured-event', (_actor, event) => this._key(event));
        this._connect(menu, 'open-state-changed', (_menu, open) => {
            if (open)
                this._search?.grab_key_focus();
        });
        this.refresh();
        if (menu.isOpen)
            this._search?.grab_key_focus();
    }

    _connect(actor, signal, fn, row = false) {
        (row ? this._rowSignals : this._signals).push([actor, actor.connect(signal, fn)]);
    }

    _button(item, icon, label, action) {
        const button = new St.Button({
            child: new St.Icon({icon_name: icon, icon_size: 16}),
            accessible_name: label, can_focus: true,
        });
        this._connect(button, 'clicked', action, true);
        item.add_child(button);
    }

    _pin(entry) {
        if (!this._ext._history.togglePin(entry.id))
            showOsd('dialog-warning-symbolic', _('Favorite limit reached'));
    }

    _focused() {
        const focus = global.stage.get_key_focus();
        return focus ? this._rows.find(row => row.item === focus || row.item.contains(focus)) : null;
    }

    refresh() {
        const focusedId = this._focused()?.entry.id;
        disconnect(this._rowSignals);
        this._section.removeAll();
        this._rows = [];
        const ext = this._ext;
        const limit = ext._settings.get_int('max-displayed-entries');
        const entries = filterEntries(ext._history.entries, this._search?.text ?? '', ext._favoritesOnly, limit + 1);
        for (const entry of entries.slice(0, limit)) {
            const item = new PopupMenu.PopupBaseMenuItem();
            if (entry.kind === 'image') {
                item.add_child(new St.Icon({gicon: Gio.BytesIcon.new(entry._bytes), icon_size: 64}));
                item.add_child(new St.Label({text: _('Image'), x_expand: true}));
            } else {
                const max = ext._settings.get_int('preview-length');
                const preview = entry.text.slice(0, 4096).replace(/\s+/g, ' ');
                const truncated = entry.text.length > 4096 || preview.length > max;
                const shown = truncated ? `${preview.slice(0, max - 1).replace(/[\uD800-\uDBFF]$/, '')}…` : preview;
                item.add_child(new St.Label({text: shown, x_expand: true, style: 'max-width: 520px;'}));
            }
            if (this._controls) {
                this._button(item, entry.pinned ? 'starred-symbolic' : 'non-starred-symbolic',
                    entry.pinned ? _('Unpin') : _('Pin'), () => this._pin(entry));
                this._button(item, 'view-reveal-symbolic', _('Preview'), () => previewEntry(ext, entry));
                this._button(item, 'window-close-symbolic', _('Delete'), () => ext._history.remove(entry.id));
            } else if (entry.pinned) {
                item.add_child(new St.Icon({icon_name: 'starred-symbolic', icon_size: 16, accessible_name: _('Pinned')}));
            }
            this._connect(item, 'activate', () => ext._selectEntry(entry), true);
            this._section.addMenuItem(item);
            this._rows.push({item, entry});
        }
        let status = '';
        if (!ext._history.isReady)
            status = ext._history.loadFailed ? _('History unavailable. Check the Shell log.') : _('Loading clipboard history…');
        else if (!entries.length)
            status = ext._history.entries.length ? _('No matching entries') : _('Clipboard history is empty');
        else if (entries.length > limit)
            status = _('More entries match. Refine your search.');
        this._status.label.text = status;
        this._status.visible = !!status;
        if (focusedId)
            (this._rows.find(row => row.entry.id === focusedId)?.item ?? this._search ?? this._menu.actor).grab_key_focus();
    }

    _key(event) {
        if (event.type() !== Clutter.EventType.KEY_PRESS)
            return Clutter.EVENT_PROPAGATE;
        const ext = this._ext;
        const key = event.get_key_symbol();
        const state = event.get_state();
        const ctrl = !!(state & Clutter.ModifierType.CONTROL_MASK);
        const alt = !!(state & Clutter.ModifierType.MOD1_MASK);
        const row = this._focused();
        if (ctrl && key >= Clutter.KEY_1 && key <= Clutter.KEY_9) {
            const entry = this._rows[key - Clutter.KEY_1]?.entry;
            if (entry)
                ext._selectEntry(entry);
        } else if (alt && (key === Clutter.KEY_f || key === Clutter.KEY_F)) {
            this._favorites.toggle();
        } else if (row && ctrl && (key === Clutter.KEY_p || key === Clutter.KEY_P)) {
            this._pin(row.entry);
        } else if (row && key === Clutter.KEY_Delete) {
            ext._history.remove(row.entry.id);
        } else if (row && ctrl && key === Clutter.KEY_Return) {
            previewEntry(ext, row.entry);
        } else if (!row && this._search?.contains(global.stage.get_key_focus()) && key === Clutter.KEY_Down) {
            this._rows[0]?.item.grab_key_focus();
        } else if (!row && this._search?.contains(global.stage.get_key_focus()) && key === Clutter.KEY_Return) {
            if (this._rows.length)
                ext._selectEntry(this._rows[0].entry);
        } else {
            return Clutter.EVENT_PROPAGATE;
        }
        return Clutter.EVENT_STOP;
    }

    destroy() {
        disconnect(this._rowSignals);
        disconnect(this._signals);
        this._section.destroy();
        this._search?.destroy();
        this._favorites.destroy();
        this._status.destroy();
        this._menu.removeAll();
        this._rows = [];
        this._ext = null;
        this._menu = null;
        this._section = null;
        this._search = null;
        this._favorites = null;
        this._status = null;
    }
}

export function rebuildMenu(ext) {
    ext._popupView?.destroy();
    ext._popupView = new HistoryMenu(ext, ext._menu, false);
}

export function rebuildPanelMenu(ext) {
    ext._panelView?.destroy();
    ext._panelView = new HistoryMenu(ext, ext._indicator.menu, true);
}

export function releaseMenu(ext) {
    ext._popupView?.destroy();
    ext._panelView?.destroy();
    ext._popupView = null;
    ext._panelView = null;
}
