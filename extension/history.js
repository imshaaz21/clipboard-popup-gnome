import GLib from 'gi://GLib';

import {HistoryStorage} from './storage.js';

// A single entry above these sizes is never stored: big pastes would bloat RAM and history.json.
export const MAX_TEXT_BYTES = 1 << 20;
export const MAX_IMAGE_BYTES = 8 << 20;
const MAX_PINNED = 200;

export function imageSize(bytes) {
    if (!bytes || bytes.get_size() < 33 || bytes.get_size() > MAX_IMAGE_BYTES)
        return 0;
    const data = bytes.get_data();
    const header = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82];
    if (!header.every((v, i) => data[i] === v))
        return 0;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const width = view.getUint32(16), height = view.getUint32(20);
    return width > 0 && height > 0 && width <= 16384 && height <= 16384 &&
        width * height <= 32 * 1024 * 1024 ? bytes.get_size() : 0;
}

export function filterEntries(entries, query, pinnedOnly, limit) {
    const q = query.trim().toLocaleLowerCase();
    return entries.filter(e => (!pinnedOnly || e.pinned) &&
        (!q || (e.text ?? '').toLocaleLowerCase().includes(q))).slice(0, limit);
}

// One entry in the clipboard history.
// {id, kind: 'text'|'image', text?, imageFile?, pinned, timestamp}
export class History {
    constructor(options = {}, storage = new HistoryStorage()) {
        this.entries = [];
        this.isReady = false;
        this._closed = false;
        this._storage = storage;
        this._options = {maxEntries: 25, maxBytes: 10 << 20, maxAgeMs: 0, onlyPinned: false, ...options};
        this._dirty = false;
        this._pending = null;
        this.onChanged = null;
        this.onError = null;
        this.ready = this._load();
    }

    async _load() {
        try {
            const entries = await this._storage.load(this._options.maxBytes);
            if (this._closed)
                return;
            const seen = new Map();
            for (const value of entries) {
                if (!value || typeof value !== 'object')
                    continue;
                const entry = this._entry(value);
                if (!entry)
                    continue;
                const key = entry.kind === 'text' ? `text:${entry.text}` : `image:${entry.imgHash}`;
                const previous = seen.get(key);
                if (previous) {
                    previous.pinned ||= entry.pinned;
                    continue;
                }
                seen.set(key, entry);
            }
            // Copies are accepted only after loading, so startup cannot overwrite saved entries.
            this.entries = [...seen.values()];
        } catch (e) {
            if (!this._closed) {
                this.loadFailed = true;
                this.onError?.();
                this.onChanged?.();
                console.error('clipboard-popup: history could not be loaded');
            }
            return;
        }
        if (this._closed)
            return;
        this.isReady = true;
        this.trim();
        if (this._options.onlyPinned)
            this.save();
        this.onChanged?.();
    }

    _entry(value) {
        const entry = {
            id: GLib.uuid_string_random(), kind: value.kind, pinned: value.pinned === true,
            timestamp: Number.isFinite(value.timestamp) ? Math.min(value.timestamp, Date.now()) : Date.now(),
        };
        if (value.kind === 'text') {
            if (typeof value.text !== 'string' || !value.text.trim() || value.text.includes('\0'))
                return null;
            entry.size = new TextEncoder().encode(value.text).length;
            if (entry.size > MAX_TEXT_BYTES)
                return null;
            entry.text = value.text;
        } else if (value.kind === 'image') {
            entry.size = imageSize(value._bytes);
            if (!entry.size)
                return null;
            entry._bytes = value._bytes;
            entry.imgHash = GLib.compute_checksum_for_bytes(GLib.ChecksumType.SHA256, value._bytes);
        } else {
            return null;
        }
        return entry;
    }

    configure(options) {
        if (this._closed)
            return;
        Object.assign(this._options, options);
        if (this.isReady) {
            this.trim();
            this.save();
            this.onChanged?.();
        }
    }

    save() {
        if (this._closed || !this.isReady)
            return;
        this._dirty = true;
        if (!this._pending)
            this._pending = this._persist();
    }

    async _persist() {
        try {
            while (this._dirty && !this._closed) {
                this._dirty = false;
                const entries = this.entries.filter(e => !this._options.onlyPinned || e.pinned)
                    .map(e => ({...e}));
                await this._storage.save(entries);
            }
        } catch (e) {
            if (!this._closed) {
                this.onError?.();
                console.error('clipboard-popup: history could not be saved');
            }
        } finally {
            this._pending = null;
        }
    }

    async whenSaved() {
        while (this._pending)
            await this._pending;
    }

    _add(value) {
        if (!this.isReady || this._closed)
            return null;
        const entry = this._entry(value);
        if (!entry)
            return null;
        const duplicate = this.entries.find(e => e.kind === entry.kind &&
            (e.kind === 'text' ? e.text === entry.text : e.imgHash === entry.imgHash));
        if (duplicate) {
            duplicate.timestamp = Date.now();
            this.entries = [duplicate, ...this.entries.filter(e => e !== duplicate)];
            this._changed();
            return duplicate;
        }
        const pinnedBytes = this.entries.filter(e => e.pinned).reduce((sum, e) => sum + e.size, 0);
        if (entry.size + pinnedBytes > this._options.maxBytes)
            return null;
        // Image bytes stay in the bounded cache, including entries that must never touch disk.
        this.entries.unshift(entry);
        this._changed();
        return entry;
    }

    addText(text) {
        return this._add({kind: 'text', text});
    }

    addImage(bytes) {
        return this._add({kind: 'image', _bytes: bytes});
    }

    // Favorites-only snapshots exclude unpinned text and image files before any write.
    finalize() {
        this._closed = true;
        this.isReady = false;
        this.onChanged = null;
        this.onError = null;
        this._storage?.destroy();
        this._storage = null;
        this._options = null;
        this._dirty = false;
        this.entries = [];
        this.ready = null;
    }

    _changed() {
        this.trim();
        this.save();
        this.onChanged?.();
    }

    moveFirst(id) {
        const entry = this.entries.find(e => e.id === id);
        if (entry) {
            this.entries = [entry, ...this.entries.filter(e => e !== entry)];
            this._changed();
        }
    }

    togglePin(id) {
        const entry = this.entries.find(e => e.id === id);
        if (!entry || (!entry.pinned && this.entries.filter(e => e.pinned).length >= MAX_PINNED))
            return false;
        entry.pinned = !entry.pinned;
        this._changed();
        return true;
    }

    remove(id) {
        this.entries = this.entries.filter(e => e.id !== id);
        this._changed();
    }

    clear() {
        this.entries = this.entries.filter(e => e.pinned);
        this._changed();
    }

    trim() {
        if (!this.isReady || this._closed)
            return;
        const {maxEntries, maxBytes, maxAgeMs} = this._options;
        const before = this.entries.length;
        let pins = 0, pinnedBytes = 0;
        this.entries = this.entries.filter(e => {
            if (!e.pinned)
                return !maxAgeMs || Date.now() - e.timestamp < maxAgeMs;
            if (++pins > MAX_PINNED)
                return false;
            pinnedBytes += e.size;
            return true;
        });
        let count = 0, total = pinnedBytes;
        this.entries = this.entries.filter(e => {
            if (e.pinned)
                return true;
            count++;
            if (count > maxEntries || total + e.size > maxBytes)
                return false;
            total += e.size;
            return true;
        });
        if (before !== this.entries.length)
            this.save();
    }
}
