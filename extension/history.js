import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

const HISTORY_FILE = 'history.json';
const IMAGES_DIR = 'images';

// One entry in the clipboard history.
// {id, kind: 'text'|'image', text?, imageFile?, pinned, timestamp}
export class History {
    constructor() {
        this._dir = GLib.build_filenamev([GLib.get_user_cache_dir(), 'clipboard-popup']);
        this._imagesDir = GLib.build_filenamev([this._dir, IMAGES_DIR]);
        this._file = GLib.build_filenamev([this._dir, HISTORY_FILE]);
        this.entries = [];
        this._nextId = 1;
        this._load();
    }

    _load() {
        const file = Gio.File.new_for_path(this._file);
        file.load_contents_async(null, (f, res) => {
            try {
                const [ok, data] = f.load_contents_finish(res);
                if (!ok)
                    return;
                const entries = JSON.parse(new TextDecoder().decode(data));
                this.entries = entries.filter(e => e.kind === 'text' || e.kind === 'image');
                for (const e of this.entries) {
                    if (e.id >= this._nextId)
                        this._nextId = e.id + 1;
                }
            } catch (e) {
                // No saved history yet.
            }
        });
    }

    _save() {
        try {
            GLib.mkdir_with_parents(this._dir, 0o700);
            const file = Gio.File.new_for_path(this._file);
            const json = JSON.stringify(this.entries, (k, v) => k === '_bytes' ? undefined : v);
            file.replace_contents_async(new TextEncoder().encode(json),
                null, false, Gio.FileCreateFlags.NONE, null, (f, res) => {
                    try {
                        f.replace_contents_finish(res);
                    } catch (e) {
                        console.error(`clipboard-popup: save failed: ${e.message}`);
                    }
                });
        } catch (e) {
            console.error(`clipboard-popup: save failed: ${e.message}`);
        }
    }

    // Returns the entry added, or null if skipped (duplicate of most recent).
    addText(text) {
        if (!text || !text.trim())
            return null;
        if (this.entries[0]?.kind === 'text' && this.entries[0].text === text)
            return null;
        const entry = {id: this._nextId++, kind: 'text', text, pinned: false, timestamp: Date.now()};
        this.entries.unshift(entry);
        return entry;
    }

    // bytes: GLib.Bytes of PNG data. Writes it to the images dir.
    addImage(bytes) {
        try {
            GLib.mkdir_with_parents(this._imagesDir, 0o700);
            const name = `img-${Date.now()}.png`;
            const path = GLib.build_filenamev([this._imagesDir, name]);
            const file = Gio.File.new_for_path(path);
            file.replace_contents_async(bytes.get_data(), null, false,
                Gio.FileCreateFlags.NONE, null, (f, res) => {
                    try {
                        f.replace_contents_finish(res);
                    } catch (e) {
                        console.error(`clipboard-popup: image write failed: ${e.message}`);
                    }
                });
            const entry = {id: this._nextId++, kind: 'image', imageFile: path, pinned: false, timestamp: Date.now()};
            entry._bytes = bytes; // kept in memory so selecting it needs no disk read
            this.entries.unshift(entry);
            return entry;
        } catch (e) {
            console.error(`clipboard-popup: image save failed: ${e.message}`);
            return null;
        }
    }

    togglePin(id) {
        const e = this.entries.find(x => x.id === id);
        if (e) {
            e.pinned = !e.pinned;
            this._save();
        }
    }

    remove(id) {
        const e = this.entries.find(x => x.id === id);
        if (!e)
            return;
        if (e.kind === 'image')
            try { Gio.File.new_for_path(e.imageFile).delete(null); } catch (_) {}
        this.entries = this.entries.filter(x => x.id !== id);
        this._save();
    }

    clear() {
        const removed = this.entries.filter(e => !e.pinned);
        for (const e of removed) {
            if (e.kind === 'image')
                try { Gio.File.new_for_path(e.imageFile).delete(null); } catch (_) {}
        }
        this.entries = this.entries.filter(e => e.pinned);
        this._save();
    }

    // Drop oldest unpinned entries beyond the limit.
    trim(maxSize) {
        let unpinnedCount = this.entries.filter(e => !e.pinned).length;
        for (let i = this.entries.length - 1; i >= 0 && unpinnedCount > maxSize; i--) {
            const e = this.entries[i];
            if (e.pinned)
                continue;
            if (e.kind === 'image')
                try { Gio.File.new_for_path(e.imageFile).delete(null); } catch (_) {}
            this.entries.splice(i, 1);
            unpinnedCount--;
        }
        this._save();
    }
}
