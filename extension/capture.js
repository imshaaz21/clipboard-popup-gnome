import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';

import {MAX_TEXT_BYTES, MAX_IMAGE_BYTES} from './history.js';

export function excludedApplication(excluded, names) {
    const normalize = value => value.trim().toLowerCase().replace(/\.desktop$/, '');
    const identifiers = names.filter(Boolean).map(normalize);
    return excluded.some(value => identifiers.includes(normalize(value)));
}

export function captureFormat(mimes) {
    if (mimes.includes('x-kde-passwordManagerHint'))
        return null;
    if (mimes.includes('image/png'))
        return {mime: 'image/png', limit: MAX_IMAGE_BYTES, kind: 'image'};
    const mime = ['text/plain;charset=utf-8', 'utf8_string', 'text/plain']
        .map(type => mimes.find(value => value.toLowerCase() === type)).find(Boolean);
    return mime ? {mime, limit: MAX_TEXT_BYTES, kind: 'text'} : null;
}

function transfer(selection, type, format, cancellable) {
    const stream = Gio.MemoryOutputStream.new_resizable();
    return new Promise((resolve, reject) => {
        selection.transfer_async(type, format.mime, format.limit + 1, stream, cancellable, (source, result) => {
            let error = null;
            try {
                source.transfer_finish(result);
            } catch (e) {
                error = e;
            }
            stream.close_async(GLib.PRIORITY_DEFAULT, null, (output, closed) => {
                try {
                    output.close_finish(closed);
                    if (error)
                        throw error;
                    const bytes = output.steal_as_bytes();
                    resolve(bytes.get_size() <= format.limit ? bytes : null);
                } catch (e) {
                    reject(e);
                }
            });
        });
    });
}

export class Capture {
    constructor(selection, allowed, onEntry) {
        this._selection = selection;
        this._allowed = allowed;
        this._onEntry = onEntry;
        this._requests = new Map();
    }

    async changed(type) {
        if (type !== Meta.SelectionType.SELECTION_CLIPBOARD && type !== Meta.SelectionType.SELECTION_PRIMARY)
            return;
        this._requests.get(type)?.cancel();
        this._requests.delete(type);
        if (!this._allowed?.(type))
            return;
        const format = captureFormat(this._selection.get_mimetypes(type) ?? []);
        if (!format || (type === Meta.SelectionType.SELECTION_PRIMARY && format.kind !== 'text'))
            return;
        const cancellable = new Gio.Cancellable();
        this._requests.set(type, cancellable);
        try {
            const bytes = await transfer(this._selection, type, format, cancellable);
            if (!bytes || cancellable.is_cancelled() || this._requests.get(type) !== cancellable ||
                !this._allowed?.(type) || !captureFormat(this._selection.get_mimetypes(type) ?? []))
                return;
            const value = format.kind === 'image' ? bytes : new TextDecoder('utf-8', {fatal: true}).decode(bytes.get_data());
            this._onEntry?.(format.kind, value);
        } catch (e) {
        } finally {
            if (this._requests.get(type) === cancellable)
                this._requests.delete(type);
        }
    }

    cancel() {
        for (const cancellable of this._requests.values())
            cancellable.cancel();
        this._requests.clear();
    }

    destroy() {
        this.cancel();
        this._selection = null;
        this._allowed = null;
        this._onEntry = null;
    }
}
