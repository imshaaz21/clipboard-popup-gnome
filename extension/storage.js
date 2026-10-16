import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

function call(object, method, finish, args) {
    return new Promise((resolve, reject) => {
        object[method](...args, (source, result) => {
            try {
                resolve(source[finish](result));
            } catch (error) {
                reject(error);
            }
        });
    });
}

export async function readBytes(file, limit, cancellable) {
    const info = await call(file, 'query_info_async', 'query_info_finish', [
        'standard::type,standard::size', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
        GLib.PRIORITY_LOW, cancellable,
    ]);
    if (info.get_file_type() !== Gio.FileType.REGULAR || info.get_size() > limit)
        throw new Error('Invalid cache file');
    const stream = await call(file, 'read_async', 'read_finish', [GLib.PRIORITY_LOW, cancellable]);
    try {
        const chunks = [];
        let size = 0;
        while (size <= limit) {
            const bytes = await call(stream, 'read_bytes_async', 'read_bytes_finish', [
                Math.min(65536, limit + 1 - size), GLib.PRIORITY_LOW, cancellable,
            ]);
            if (!bytes.get_size())
                break;
            const chunk = bytes.get_data();
            chunks.push(chunk);
            size += chunk.length;
        }
        if (size > limit)
            throw new Error('Cache file is too large');
        const data = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
            data.set(chunk, offset);
            offset += chunk.length;
        }
        return new GLib.Bytes(data);
    } finally {
        await call(stream, 'close_async', 'close_finish', [GLib.PRIORITY_LOW, null]);
    }
}

async function directory(file, cancellable) {
    try {
        await call(file, 'make_directory_async', 'make_directory_finish', [GLib.PRIORITY_LOW, cancellable]);
    } catch (error) {
        if (error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) {
            await directory(file.get_parent(), cancellable);
            await call(file, 'make_directory_async', 'make_directory_finish', [GLib.PRIORITY_LOW, cancellable]);
        } else if (!error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS)) {
            throw error;
        }
    }
    const info = await call(file, 'query_info_async', 'query_info_finish', [
        'standard::type', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, GLib.PRIORITY_LOW, cancellable,
    ]);
    if (info.get_file_type() !== Gio.FileType.DIRECTORY)
        throw new Error('Invalid cache directory');
    const attributes = new Gio.FileInfo();
    attributes.set_attribute_uint32('unix::mode', 0o700);
    await call(file, 'set_attributes_async', 'set_attributes_finish', [
        attributes, Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, GLib.PRIORITY_LOW, cancellable,
    ]);
}

export class HistoryStorage {
    constructor(path = GLib.build_filenamev([GLib.get_user_cache_dir(), 'clipboard-popup'])) {
        this._dir = Gio.File.new_for_path(path);
        this._images = this._dir.get_child('images');
        this._file = this._dir.get_child('history.json');
        this._cancellable = new Gio.Cancellable();
        this._written = new Set();
        this._initialized = false;
    }

    async load() {
        const maxBytes = 100 << 20;
        try {
            const bytes = await readBytes(this._file, 128 << 20, this._cancellable);
            const values = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes.get_data()));
            if (!Array.isArray(values))
                throw new Error('Invalid history');
            const entries = [];
            let total = 0;
            for (const value of values.slice(0, 400)) {
                if (!value || typeof value !== 'object')
                    continue;
                if (value.kind === 'text' && typeof value.text === 'string') {
                    const size = new TextEncoder().encode(value.text).length;
                    if (size > (1 << 20) || total + size > maxBytes)
                        continue;
                    total += size;
                    entries.push(value);
                } else if (value.kind === 'image' && typeof value.imageFile === 'string') {
                    const file = Gio.File.new_for_path(value.imageFile);
                    if (!file.get_parent()?.equal(this._images) || !this._imageName(file.get_basename()))
                        continue;
                    try {
                        const data = await readBytes(file, Math.min(8 << 20, maxBytes - total), this._cancellable);
                        total += data.get_size();
                        entries.push({...value, _bytes: data});
                    } catch (error) {
                        if (this._cancellable.is_cancelled())
                            throw error;
                    }
                }
            }
            return entries;
        } catch (error) {
            if (error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                return [];
            throw error;
        }
    }

    _imageName(name) {
        return /^(?:img-[0-9a-f-]+|[0-9a-f]{64})\.png$/.test(name);
    }

    async _replace(file, data) {
        await call(file, 'replace_contents_async', 'replace_contents_finish', [
            data, null, false, Gio.FileCreateFlags.PRIVATE | Gio.FileCreateFlags.REPLACE_DESTINATION,
            this._cancellable,
        ]);
    }

    async save(entries) {
        if (!this._initialized) {
            await directory(this._dir, this._cancellable);
            await directory(this._images, this._cancellable);
            this._initialized = true;
        }
        const values = [];
        const kept = new Set();
        for (const entry of entries) {
            const value = {
                id: entry.id, kind: entry.kind, pinned: entry.pinned,
                timestamp: entry.timestamp, size: entry.size,
            };
            if (entry.kind === 'image') {
                const name = `${entry.imgHash}.png`;
                const file = this._images.get_child(name);
                if (!this._written.has(name)) {
                    await this._replace(file, entry._bytes.get_data());
                    this._written.add(name);
                }
                value.imageFile = file.get_path();
                value.imgHash = entry.imgHash;
                kept.add(name);
            } else {
                value.text = entry.text;
            }
            values.push(value);
        }
        const data = new TextEncoder().encode(JSON.stringify(values));
        if (data.length > (128 << 20))
            throw new Error('History is too large');
        await this._replace(this._file, data);
        await this._prune(kept);
    }

    async _prune(kept) {
        const enumerator = await call(this._images, 'enumerate_children_async', 'enumerate_children_finish', [
            'standard::name,standard::type', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
            GLib.PRIORITY_LOW, this._cancellable,
        ]);
        try {
            while (true) {
                const files = await call(enumerator, 'next_files_async', 'next_files_finish', [
                    32, GLib.PRIORITY_LOW, this._cancellable,
                ]);
                if (!files.length)
                    break;
                for (const info of files) {
                    const name = info.get_name();
                    if (!this._imageName(name) || kept.has(name) || info.get_file_type() !== Gio.FileType.REGULAR)
                        continue;
                    const file = this._images.get_child(name);
                    await call(file, 'delete_async', 'delete_finish', [GLib.PRIORITY_LOW, this._cancellable]);
                    this._written.delete(name);
                }
            }
        } finally {
            await call(enumerator, 'close_async', 'close_finish', [GLib.PRIORITY_LOW, null]);
        }
    }

    destroy() {
        this._cancellable.cancel();
        this._written.clear();
    }
}
