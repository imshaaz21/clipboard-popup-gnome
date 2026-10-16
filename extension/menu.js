import Gio from 'gi://Gio';
import St from 'gi://St';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

function trackSignal(ext, actor, id) {
    if (!ext._menuSignals)
        ext._menuSignals = [];
    ext._menuSignals.push({actor, id});
}

function disconnectMenuSignals(ext) {
    if (!ext._menuSignals)
        return;
    for (const pair of ext._menuSignals) {
        try {
            pair.actor.disconnect(pair.id);
        } catch (e) {
            // actor already destroyed; nothing left to disconnect
        }
    }
    ext._menuSignals = null;
}

function iconButton(ext, iconName, onClick) {
    const btn = new St.Button({child: new St.Icon({icon_name: iconName, icon_size: 14})});
    trackSignal(ext, btn, btn.connect('clicked', onClick));
    return btn;
}

function makeEntryItem(ext, entry, controls = false) {
    const item = new PopupMenu.PopupBaseMenuItem();

    if (entry.kind === 'image') {
        item.add_child(new St.Icon({
            gicon: Gio.FileIcon.new(Gio.File.new_for_path(entry.imageFile)),
            icon_size: 64,
        }));
    } else {
        const preview = entry.text.replace(/\s+/g, ' ');
        const max = ext._settings.get_int('preview-length');
        const shown = preview.length > max ? `${preview.slice(0, max - 1)}…` : preview;
        item.add_child(new St.Label({
            text: entry.pinned && !controls ? `★ ${shown}` : shown,
            x_expand: true,
        }));
    }

    if (controls) {
        item.add_child(iconButton(ext, entry.pinned ? 'starred-symbolic' : 'non-starred-symbolic',
            () => {
                ext._history.togglePin(entry.id);
                rebuildPanelMenu(ext);
            }));
        item.add_child(iconButton(ext, 'window-close-symbolic',
            () => {
                ext._history.remove(entry.id);
                rebuildPanelMenu(ext);
            }));
    }

    trackSignal(ext, item, item.connect('activate', () => ext._selectEntry(entry)));
    return item;
}

export function rebuildMenu(ext) {
    if (!ext._menu || !ext._history || !ext._settings)
        return;
    disconnectMenuSignals(ext);
    ext._menu.removeAll();

    const pairs = [];
    if (ext._settings.get_boolean('enable-typeahead-search') && ext._history.entries.length > 0) {
        const searchItem = new PopupMenu.PopupBaseMenuItem({reactive: false});
        const search = new St.Entry({hint_text: _('Type to search'), x_expand: true, can_focus: true});
        trackSignal(ext, search, search.connect('notify::text', () => {
            const q = search.text.trim().toLowerCase();
            for (const pair of pairs) {
                pair.item.visible = q.length === 0 ||
                    (pair.entry.text ?? (pair.entry.kind === 'image' ? _('Image') : ''))
                        .toLowerCase().includes(q);
            }
        }));
        searchItem.add_child(search);
        ext._menu.addMenuItem(searchItem);
        trackSignal(ext, ext._menu, ext._menu.connect('open-state-changed', (_m, open) => {
            if (open)
                search.grab_key_focus();
        }));
    }

    if (ext._history.entries.length === 0) {
        const empty = new PopupMenu.PopupMenuItem(_('Clipboard history is empty'), {reactive: false});
        ext._menu.addMenuItem(empty);
    } else {
        const scroll = new St.ScrollView({
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            overlay_scrollbars: true,
            y_expand: false,
            style: 'max-height: 480px;',
        });
        const section = new PopupMenu.PopupMenuSection();
        const maxShown = ext._settings.get_int('max-displayed-entries');
        for (const entry of ext._history.entries.slice(0, maxShown)) {
            const item = makeEntryItem(ext, entry);
            pairs.push({item, entry});
            section.addMenuItem(item);
        }
        scroll.add_child(section.actor);
        const scrollSection = new PopupMenu.PopupMenuSection();
        scrollSection.actor.add_child(scroll);
        ext._menu.addMenuItem(scrollSection);
    }
}

export function releaseMenu(ext) {
    disconnectMenuSignals(ext);
}

export function rebuildPanelMenu(ext) {
    const menu = ext._indicator?.menu;
    if (!menu || !ext._history || !ext._settings)
        return;
    disconnectMenuSignals(ext);
    menu.removeAll();

    const openItem = new PopupMenu.PopupMenuItem(_('Open clipboard popup'));
    trackSignal(ext, openItem, openItem.connect('activate', () => ext._openPopup()));
    menu.addMenuItem(openItem);

    const privateItem = new PopupMenu.PopupSwitchMenuItem(_('Private mode'), ext._settings.get_boolean('private-mode'));
    trackSignal(ext, privateItem, privateItem.connect('toggled',
        () => ext._settings.set_boolean('private-mode', privateItem.state)));
    menu.addMenuItem(privateItem);

    menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    const section = new PopupMenu.PopupMenuSection();
    for (const entry of ext._history.entries)
        section.addMenuItem(makeEntryItem(ext, entry, true));
    menu.addMenuItem(section);

    menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    const clearItem = new PopupMenu.PopupMenuItem(_('Clear history (keeps pinned)'));
    trackSignal(ext, clearItem, clearItem.connect('activate', () => {
        ext._history.clear();
        rebuildPanelMenu(ext);
    }));
    menu.addMenuItem(clearItem);
}
