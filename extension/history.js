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
        this.onlyPinned = false;
        this._load();
    }

    _load() {
        const file = Gio.File.new_for_path(this._file);
        file.load_contents_async(null, (f, res) => {
            try {
                const [ok, data] = f.load_contents_finish(res);
                if (!ok)
                    return;
                const entries = JSON.parse(new TextDecoder().decode(data))
                    .filter(e => e.kind === 'text' || e.kind === 'image');
                // Merge: copies captured before the load finished stay on top.
                this.entries = this.entries.concat(entries);
                for (const e of this.entries) {
                    if (e.id >= this._nextId)
                        this._nextId = e.id + 1;
                }
            } catch (e) {
            }
        });
    }

    save() {
        try {
            GLib.mkdir_with_parents(this._dir, 0o700);
            const file = Gio.File.new_for_path(this._file);
            const entries = this.onlyPinned ? this.entries.filter(e => e.pinned) : this.entries;
            const json = JSON.stringify(entries, (k, v) => k === '_bytes' ? undefined : v);
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

    addText(text) {
        if (!text || !text.trim())
            return null;
        if (this.entries[0]?.kind === 'text' && this.entries[0].text === text)
            return null;
        const entry = {id: this._nextId++, kind: 'text', text, pinned: false, timestamp: Date.now()};
        this.entries.unshift(entry);
        this.save();
        return entry;
    }

    addImage(bytes) {
        const hash = GLib.compute_checksum_for_bytes(GLib.ChecksumType.SHA256, bytes);
        if (this.entries.some(e => e.kind === 'image' && e.imgHash === hash))
            return null;
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
            const entry = {id: this._nextId++, kind: 'image', imageFile: path, imgHash: hash, pinned: false, timestamp: Date.now()};
            entry._bytes = bytes;
            for (const e of this.entries)
                delete e._bytes; // only the newest image keeps its bytes in memory
            this.entries.unshift(entry);
            this.save();
            return entry;
        } catch (e) {
            console.error(`clipboard-popup: image save failed: ${e.message}`);
            return null;
        }
    }

    // With onlyPinned, unpinned entries aren't persisted, so drop their image files too.
    finalize() {
        if (this.onlyPinned) {
            for (const e of this.entries) {
                if (e.kind === 'image' && !e.pinned)
                    try { Gio.File.new_for_path(e.imageFile).delete(null); } catch (_) {}
            }
        }
        this.save();
    }

    moveFirst(id) {
        const i = this.entries.findIndex(x => x.id === id);
        if (i > 0) {
            this.entries.unshift(this.entries.splice(i, 1)[0]);
            this.save();
        }
    }

    togglePin(id) {
        const e = this.entries.find(x => x.id === id);
        if (e) {
            e.pinned = !e.pinned;
            this.save();
        }
    }

    remove(id) {
        const e = this.entries.find(x => x.id === id);
        if (!e)
            return;
        if (e.kind === 'image')
            try { Gio.File.new_for_path(e.imageFile).delete(null); } catch (_) {}
        this.entries = this.entries.filter(x => x.id !== id);
        this.save();
    }

    clear() {
        const removed = this.entries.filter(e => !e.pinned);
        for (const e of removed) {
            if (e.kind === 'image')
                try { Gio.File.new_for_path(e.imageFile).delete(null); } catch (_) {}
        }
        this.entries = this.entries.filter(e => e.pinned);
        this.save();
    }

    trim(maxSize) {
        let unpinnedCount = this.entries.filter(e => !e.pinned).length;
        const before = this.entries.length;
        for (let i = this.entries.length - 1; i >= 0 && unpinnedCount > maxSize; i--) {
            const e = this.entries[i];
            if (e.pinned)
                continue;
            if (e.kind === 'image')
                try { Gio.File.new_for_path(e.imageFile).delete(null); } catch (_) {}
            this.entries.splice(i, 1);
            unpinnedCount--;
        }
        if (this.entries.length !== before)
            this.save();
    }
}
