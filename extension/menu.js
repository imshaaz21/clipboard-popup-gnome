import Gio from 'gi://Gio';
import St from 'gi://St';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

function trackSignal(ext, actor, id) {
    if (!ext._menuSignals)
        ext._menuSignals = [];
    ext._menuSignals.push([actor, id]);
}

function disconnectMenuSignals(ext) {
    if (!ext._menuSignals)
        return;
    for (const [actor, id] of ext._menuSignals) {
        try {
            actor.disconnect(id);
        } catch (e) {
            // actor already destroyed
        }
    }
    ext._menuSignals = null;
}

function iconButton(ext, iconName, onClick) {
    const btn = new St.Button({
        child: new St.Icon({icon_name: iconName, icon_size: 14}),
    });
    trackSignal(ext, btn, btn.connect('clicked', onClick));
    return btn;
}

function makeEntryItem(ext, entry) {
    const item = new PopupMenu.PopupBaseMenuItem();

    if (entry.kind === 'image') {
        item.add_child(new St.Icon({
            gicon: Gio.FileIcon.new(Gio.File.new_for_path(entry.imageFile)),
            icon_size: 64,
        }));
    } else {
        const preview = entry.text.replace(/\s+/g, ' ');
        const max = ext._settings.get_int('preview-length');
        item.add_child(new St.Label({
            text: preview.length > max ? `${preview.slice(0, max - 1)}…` : preview,
            x_expand: true,
        }));
    }

    item.add_child(iconButton(ext, entry.pinned ? 'starred-symbolic' : 'non-starred-symbolic',
        () => {
            ext._history.togglePin(entry.id);
            rebuildMenu(ext);
        }));
    item.add_child(iconButton(ext, 'window-close-symbolic',
        () => {
            ext._history.remove(entry.id);
            rebuildMenu(ext);
        }));

    trackSignal(ext, item, item.connect('activate', () => ext._selectEntry(entry)));
    return item;
}

export function rebuildMenu(ext) {
    disconnectMenuSignals(ext);
    ext._menu.removeAll();

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
        for (const entry of ext._history.entries)
            section.addMenuItem(makeEntryItem(ext, entry));
        scroll.add_child(section.actor);
        const scrollSection = new PopupMenu.PopupMenuSection();
        scrollSection.actor.add_child(scroll);
        ext._menu.addMenuItem(scrollSection);
    }

    ext._menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    const clearItem = new PopupMenu.PopupMenuItem(_('Clear history (keeps pinned)'));
    let armed = false;
    trackSignal(ext, clearItem, clearItem.connect('activate', () => {
        if (ext._settings.get_boolean('confirm-clear') && !armed) {
            armed = true;
            clearItem.label.set_text(_('Really clear? Click again'));
            return;
        }
        ext._history.clear();
        armed = false;
        rebuildMenu(ext);
    }));
    ext._menu.addMenuItem(clearItem);
}

export function releaseMenu(ext) {
    disconnectMenuSignals(ext);
}
