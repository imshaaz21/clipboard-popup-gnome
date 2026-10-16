import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {HistoryStorage, readBytes} from '../extension/storage.js';
import {History} from '../extension/history.js';

function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}

const root = Gio.File.new_for_path(GLib.dir_make_tmp('clipboard-popup-tests-XXXXXX'));
const path = root.get_child('cache').get_path();
const image = new GLib.Bytes(GLib.base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX+XDSwAAAABJRU5ErkJggg=='));
const cancel = new Gio.Cancellable();
const content = file => JSON.parse(new TextDecoder().decode(file.load_contents(null)[1]));
function removeTree(file) {
    const info = file.query_info('standard::type', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
    if (info.get_file_type() === Gio.FileType.DIRECTORY) {
        const children = file.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
        let child;
        while ((child = children.next_file(null)))
            removeTree(file.get_child(child.get_name()));
        children.close(null);
    }
    file.delete(null);
}

try {
    let history = new History({}, new HistoryStorage(path));
    await history.ready;
    history.addText('persisted text');
    const original = history.addImage(image);
    history.togglePin(original.id);
    await history.whenSaved();
    const cache = Gio.File.new_for_path(path);
    const file = cache.get_child('history.json');
    let values = content(file);
    assert(values.length === 2, 'text and PNG persist');
    assert(!('_bytes' in values[0]), 'runtime bytes are not serialized');
    assert((file.query_info('unix::mode', 0, null).get_attribute_uint32('unix::mode') & 0o777) === 0o600,
        'history must be owner-only');
    assert((cache.query_info('unix::mode', 0, null).get_attribute_uint32('unix::mode') & 0o777) === 0o700,
        'cache directory must be owner-only');
    const imageFile = Gio.File.new_for_path(values[0].imageFile);
    assert((imageFile.query_info('unix::mode', 0, null).get_attribute_uint32('unix::mode') & 0o777) === 0o600,
        'image must be owner-only');
    history.finalize();
    history = new History({}, new HistoryStorage(path));
    await history.ready;
    assert(history.entries.length === 2, 'restart restores both entries');
    assert(history.entries[0]._bytes.get_size() === image.get_size(), 'restart restores image bytes');
    assert(history.entries[0].pinned, 'restart preserves pin');
    history.configure({onlyPinned: true});
    history.addText('memory only');
    await history.whenSaved();
    assert(content(file).length === 1, 'favorites-only drops persisted unpinned text');
    history.togglePin(history.entries.find(e => e.kind === 'image').id);
    await history.whenSaved();
    assert(content(file).length === 0, 'unpinning removes persistent entry');
    assert(!imageFile.query_exists(null), 'unpinning removes image file');
    assert(history.entries.find(e => e.kind === 'image')._bytes.get_size() === image.get_size(),
        'unpersisted image remains usable in memory');
    history.finalize();
    print('PASS real GIO persistence, permissions, restart, and favorites-only cleanup');

    const outside = root.get_child('outside.png');
    outside.replace_contents(image.get_data(), null, false, Gio.FileCreateFlags.PRIVATE, null);
    file.replace_contents(new TextEncoder().encode(JSON.stringify([
        {kind: 'image', imageFile: outside.get_path(), pinned: true, timestamp: Date.now()},
        {kind: 'text', text: 'safe', timestamp: Date.now()},
    ])), null, false, Gio.FileCreateFlags.PRIVATE, null);
    history = new History({}, new HistoryStorage(path));
    await history.ready;
    assert(history.entries.length === 1 && history.entries[0].text === 'safe', 'outside image paths are rejected');
    history.clear(); await history.whenSaved();
    assert(outside.query_exists(null), 'outside image is never deleted');
    history.finalize();
    print('PASS cache path confinement');

    const link = root.get_child('link.png');
    link.make_symbolic_link(outside.get_path(), null);
    let rejected = false;
    try {
        await readBytes(link, 1024, cancel);
    } catch (error) {
        rejected = true;
    }
    assert(rejected, 'symlink cache files must not be read');
    rejected = false;
    try {
        await readBytes(outside, 4, cancel);
    } catch (error) {
        rejected = true;
    }
    assert(rejected, 'oversized cache files must not be read');
    print('PASS bounded reads and symlink rejection');

    file.replace_contents(new TextEncoder().encode('{broken'), null, false, Gio.FileCreateFlags.PRIVATE, null);
    history = new History({}, new HistoryStorage(path));
    await history.ready;
    assert(history.loadFailed && !history.isReady, 'corrupt history fails closed');
    assert(history.addText('must not overwrite') === null, 'capture stays disabled on load failure');
    assert(new TextDecoder().decode(file.load_contents(null)[1]) === '{broken', 'corrupt history is preserved');
    history.finalize();
    print('PASS corrupt history recovery boundary');
} finally {
    removeTree(root);
}
