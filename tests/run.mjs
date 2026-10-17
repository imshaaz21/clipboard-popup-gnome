import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import {SourceTextModule, SyntheticModule} from 'node:vm';

const tests = [];
const test = (name, fn) => tests.push({name, fn});
class Bytes {
    constructor(data) { this.data = new Uint8Array(data); }
    get_size() { return this.data.length; }
    get_data() { return this.data; }
}
const GLib = {
    Bytes,
    ChecksumType: {SHA256: 0},
    uuid_string_random: randomUUID,
    compute_checksum_for_bytes: (_type, bytes) => createHash('sha256').update(bytes.get_data()).digest('hex'),
    get_user_cache_dir: () => '/test-cache',
    build_filenamev: parts => parts.join('/'),
};
const modules = new Map();
async function load(name, mocks = {}) {
    const url = new URL(name, import.meta.url);
    const module = new SourceTextModule(await readFile(url, 'utf8'), {identifier: url.href});
    await module.link(async specifier => {
        const value = mocks[specifier] ?? (specifier === 'gi://GLib' ? {default: GLib} : null);
        if (!value)
            throw new Error(`Missing mock: ${specifier}`);
        const key = specifier;
        if (!modules.has(key)) {
            modules.set(key, new SyntheticModule(Object.keys(value), function () {
                for (const [k, v] of Object.entries(value))
                    this.setExport(k, v);
            }));
        }
        return modules.get(key);
    });
    await module.evaluate();
    return module.namespace;
}
class Store {
    constructor(entries = []) { this.entries = entries; this.saves = []; this.destroyed = false; }
    async load() { return this.entries; }
    async save(entries) { this.saves.push(entries); }
    destroy() { this.destroyed = true; }
}
const {History, filterEntries, MAX_TEXT_BYTES, MAX_IMAGE_BYTES} = await load('../extension/history.js', {
    'gi://Gio': {default: {File: {new_for_path: () => ({load_contents_async() {}})}}},
    './storage.js': {HistoryStorage: Store},
    './pixels.js': {samePixels: (a, b) => a.get_data()[40] === b.get_data()[40]},
});
const png = (width = 1, height = 1) => {
    const data = new Uint8Array(33);
    data.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
    new DataView(data.buffer).setUint32(16, width);
    new DataView(data.buffer).setUint32(20, height);
    return new Bytes(data);
};
async function history(options = {}, entries = []) {
    const store = new Store(entries);
    const h = new History(options, store);
    await h.ready;
    return {h, store};
}

test('oversized GLib.Bytes are rejected without writing', async () => {
    const {h, store} = await history();
    assert.equal(h.addImage(new Bytes(new Uint8Array((8 << 20) + 1))), null);
    assert.equal(store.saves.length, 0);
});
test('image byte accounting uses get_size()', async () => {
    const {h} = await history();
    const entry = h.addImage(png());
    assert.equal(entry.size, 33);
});
test('a re-encoded copy of the newest image is not added twice', async () => {
    const {h} = await history();
    const encode = marker => {
        const data = new Uint8Array(41);
        data.set(png(4, 4).get_data());
        data[40] = marker; // stands in for pixel content in the mocked comparison
        return new Bytes(data);
    };
    const first = h.addImage(encode(1));
    assert.equal(h.addImage(encode(1)), first);
    assert.notEqual(h.addImage(encode(2)), first);
    assert.equal(h.entries.length, 2);
});
test('invalid and decompression-bomb PNG headers are rejected', async () => {
    const {h} = await history();
    assert.equal(h.addImage(new Bytes([1, 2, 3])), null);
    assert.equal(h.addImage(png(65535, 65535)), null);
});
test('text is deduplicated across history and pins survive recopy', async () => {
    const {h} = await history();
    const first = h.addText('first');
    h.togglePin(first.id);
    h.addText('second');
    h.addText('first');
    assert.equal(h.entries.length, 2);
    assert.equal(h.entries[0].id, first.id);
    assert.equal(h.entries[0].pinned, true);
});
test('total content budget includes pinned entries', async () => {
    const {h} = await history({maxBytes: 8});
    const pinned = h.addText('12345678');
    h.togglePin(pinned.id);
    assert.equal(h.addText('x'), null);
    assert.equal(h.entries.length, 1);
});
test('trimming retains newest unpinned entries and favorites', async () => {
    const {h} = await history({maxEntries: 2});
    const pinned = h.addText('pin');
    h.togglePin(pinned.id);
    h.addText('a'); h.addText('b'); h.addText('c');
    assert.deepEqual(h.entries.map(e => e.text), ['c', 'b', 'pin']);
});
test('clear preserves favorites and remove deletes only one ID', async () => {
    const {h} = await history();
    const pinned = h.addText('pin'); h.togglePin(pinned.id);
    h.addText('other'); h.clear();
    assert.equal(h.entries.length, 1);
    h.remove(pinned.id);
    assert.equal(h.entries.length, 0);
});
test('restored entries are validated, deduplicated, and assigned unique IDs', async () => {
    const {h} = await history({}, [
        {id: 1, kind: 'text', text: 'a', pinned: true, timestamp: Date.now()},
        {id: 1, kind: 'text', text: 'b', timestamp: Date.now()},
        {id: 2, kind: 'text', text: 'a', timestamp: Date.now()},
        {kind: 'text', text: 42}, {kind: 'invalid'},
    ]);
    assert.equal(h.entries.length, 2);
    h.addText('new');
    assert.equal(new Set(h.entries.map(e => e.id)).size, 3);
});
test('copies during startup do not overwrite history before it loads', async () => {
    let finish;
    const store = new Store();
    store.load = () => new Promise(resolve => { finish = resolve; });
    const h = new History({}, store);
    assert.equal(h.addText('too early'), null);
    assert.equal(store.saves.length, 0);
    finish([{kind: 'text', text: 'saved', timestamp: Date.now()}]);
    await h.ready;
    assert.equal(h.entries[0].text, 'saved');
});
test('only favorites are persisted in favorites-only mode', async () => {
    const {h, store} = await history({onlyPinned: true});
    h.addImage(png());
    const pin = h.addText('pin'); h.togglePin(pin.id);
    h.addText('private');
    await h.whenSaved();
    assert.deepEqual(store.saves.at(-1).map(e => e.text), ['pin']);
    assert.ok(h.entries.find(e => e.kind === 'image')._bytes);
});
test('switching favorites-only mode rewrites persistence immediately', async () => {
    const {h, store} = await history();
    h.addText('secret'); await h.whenSaved();
    h.configure({onlyPinned: true}); await h.whenSaved();
    assert.deepEqual(store.saves.at(-1), []);
});
test('save operations are serialized and coalesced', async () => {
    const {h, store} = await history();
    let finish;
    store.save = entries => {
        store.saves.push(entries);
        return new Promise(resolve => { finish = resolve; });
    };
    h.addText('a'); h.addText('b'); h.addText('c');
    assert.equal(store.saves.length, 1);
    finish(); await Promise.resolve(); await Promise.resolve();
    assert.equal(store.saves.length, 2);
    finish(); await h.whenSaved();
    assert.deepEqual(store.saves[1].map(e => e.text), ['c', 'b', 'a']);
});
test('expiry removes old unpinned entries but preserves favorites', async () => {
    const now = Date.now();
    const {h} = await history({maxAgeMs: 1000}, [
        {kind: 'text', text: 'old', timestamp: now - 10000},
        {kind: 'text', text: 'pin', pinned: true, timestamp: now - 10000},
        {kind: 'text', text: 'new', timestamp: now},
    ]);
    assert.deepEqual(h.entries.map(e => e.text), ['pin', 'new']);
});
test('disable cancels storage and ignores a late load', async () => {
    let finish;
    const store = new Store();
    store.load = () => new Promise(resolve => { finish = resolve; });
    const h = new History({}, store);
    h.finalize();
    finish([{kind: 'text', text: 'late', timestamp: Date.now()}]);
    await h.ready;
    assert.equal(h.entries.length, 0);
    assert.equal(store.destroyed, true);
    assert.equal(h.addText('disabled'), null);
});

test('search includes matches beyond the display limit', () => {
    const entries = Array.from({length: 100}, (_, i) => ({text: `entry ${i}`, pinned: i === 99}));
    assert.deepEqual(filterEntries(entries, 'entry 99', false, 10), [entries[99]]);
    assert.deepEqual(filterEntries(entries, '', true, 10), [entries[99]]);
    assert.equal(filterEntries(entries, '', false, 10).length, 10);
});
test('text validation rejects NUL, whitespace, and oversized Unicode', async () => {
    const {h} = await history();
    for (const text of ['\0secret', ' \n ', 'é'.repeat((MAX_TEXT_BYTES >> 1) + 1)])
        assert.equal(h.addText(text), null);
});
test('lowering the content budget preserves existing pins and rejects new content', async () => {
    const {h} = await history();
    const entry = h.addText('12345678'); h.togglePin(entry.id);
    h.configure({maxBytes: 2});
    assert.equal(h.entries[0].id, entry.id);
    assert.equal(h.addText('x'), null);
});
test('corrupt history is not overwritten with an empty snapshot', async () => {
    const store = new Store();
    store.load = async () => { throw new Error('invalid JSON'); };
    const h = new History({}, store);
    await h.ready;
    assert.equal(h.isReady, false);
    assert.equal(h.loadFailed, true);
    assert.equal(h.addText('new'), null);
    assert.equal(store.saves.length, 0);
});
test('failed saves do not leave the persistence queue stuck', async () => {
    const {h, store} = await history();
    store.save = async () => { throw new Error('disk full'); };
    h.addText('a'); await h.whenSaved();
    store.save = async entries => { store.saves.push(entries); };
    h.addText('b'); await h.whenSaved();
    assert.deepEqual(store.saves.at(-1).map(e => e.text), ['b', 'a']);
});

class Cancellable {
    cancel() { this.cancelled = true; }
    is_cancelled() { return !!this.cancelled; }
}
class Stream {
    close_async(_priority, _cancel, callback) { queueMicrotask(() => callback(this, {})); }
    close_finish() {}
    steal_as_bytes() { return new Bytes(this.data); }
}
const Gio = {Cancellable, MemoryOutputStream: {new_resizable: () => new Stream()}};
const Meta = {SelectionType: {SELECTION_CLIPBOARD: 0, SELECTION_PRIMARY: 1}};
const {Capture, captureFormat, excludedApplication} = await load('../extension/capture.js', {
    'gi://Gio': {default: Gio},
    'gi://Meta': {default: Meta},
    './history.js': {History, filterEntries, MAX_TEXT_BYTES, MAX_IMAGE_BYTES},
});
function captureFixture(mimes = ['text/plain']) {
    const results = [], requests = [];
    const policy = {allowed: true};
    const selection = {
        mimes,
        get_mimetypes() { return this.mimes; },
        transfer_async(type, mime, size, stream, cancel, callback) {
            requests.push({type, mime, size, cancel, finish(data) {
                stream.data = typeof data === 'string' ? new TextEncoder().encode(data) : data;
                callback(selection, {});
            }});
        },
        transfer_finish() {},
    };
    const capture = new Capture(selection, () => policy.allowed, (kind, data) => results.push({kind, data}));
    return {capture, selection, policy, results, requests};
}
test('app exclusions normalize desktop IDs, window classes, and case', () => {
    assert.equal(excludedApplication(['Org.Example.App.desktop'], [null, 'org.example.app']), true);
    assert.equal(excludedApplication(['example'], ['not-example.desktop']), false);
    assert.equal(excludedApplication(['example'], [null]), false);
});
test('UTF-8 MIME parameters are case-insensitive', () => {
    assert.equal(captureFormat(['text/plain;charset=UTF-8']).kind, 'text');
});
test('password-manager hints block both text and PNG capture', () => {
    assert.equal(captureFormat(['text/plain', 'x-kde-passwordManagerHint']), null);
    assert.equal(captureFormat(['image/png', 'x-kde-passwordManagerHint']), null);
});
test('PRIMARY password-manager hints are also skipped', async () => {
    const {capture, requests} = captureFixture(['text/plain', 'x-kde-passwordManagerHint']);
    await capture.changed(Meta.SelectionType.SELECTION_PRIMARY);
    assert.equal(requests.length, 0);
});
test('clipboard transfer is size-bounded and accepts valid text', async () => {
    const {capture, requests, results} = captureFixture();
    const pending = capture.changed(0);
    assert.equal(requests[0].size, MAX_TEXT_BYTES + 1);
    requests[0].finish('hello'); await pending;
    assert.deepEqual(results, [{kind: 'text', data: 'hello'}]);
});
test('late reads after enabling private mode or excluding an app are ignored', async () => {
    const {capture, requests, results, policy} = captureFixture();
    const pending = capture.changed(0);
    policy.allowed = false;
    capture.cancel();
    requests[0].finish('secret'); await pending;
    assert.equal(results.length, 0);
    assert.equal(requests[0].cancel.is_cancelled(), true);
});
test('a new owner cancels the old clipboard transfer', async () => {
    const {capture, requests, results} = captureFixture();
    const old = capture.changed(0), current = capture.changed(0);
    requests[1].finish('new'); requests[0].finish('old');
    await Promise.all([old, current]);
    assert.deepEqual(results.map(r => r.data), ['new']);
});
test('disable ignores pending capture completion', async () => {
    const {capture, requests, results} = captureFixture();
    const pending = capture.changed(0);
    capture.destroy();
    requests[0].finish('late'); await pending;
    assert.equal(results.length, 0);
});
test('oversized and malformed UTF-8 transfers are not stored', async () => {
    for (const data of [new Uint8Array(MAX_TEXT_BYTES + 1), new Uint8Array([0xff])]) {
        const {capture, requests, results} = captureFixture();
        const pending = capture.changed(0);
        requests[0].finish(data); await pending;
        assert.equal(results.length, 0);
    }
});
test('unsupported formats and PRIMARY images do not start transfers', async () => {
    assert.equal(captureFormat(['text/html']), null);
    const {capture, requests} = captureFixture(['image/png']);
    await capture.changed(1);
    assert.equal(requests.length, 0);
});

GLib.get_monotonic_time = () => 1000;
const Clutter = {KeyState: {PRESSED: 1, RELEASED: 0}, ModifierType: {SHIFT_MASK: 1, CONTROL_MASK: 4, MOD1_MASK: 8, SUPER_MASK: 64}};
const St = {ClipboardType: {CLIPBOARD: 0}, Icon: class {}};
const main = {
    layoutManager: {focusIndex: 0}, osdWindowManager: {show() {}},
    modalCount: 0, sessionMode: {isLocked: false}, overview: {visible: false},
};
const mainPath = 'resource:///org/gnome/shell/ui/main.js';
const actions = await load('../extension/actions.js', {
    'gi://Clutter': {default: Clutter}, 'gi://Gio': {default: Gio},
    'gi://Pango': {default: {}}, 'gi://St': {default: St},
    [mainPath]: main,
    'resource:///org/gnome/shell/misc/ibusManager.js': {},
    'resource:///org/gnome/shell/ui/modalDialog.js': {},
    'resource:///org/gnome/shell/extensions/extension.js': {Extension: class {}, gettext: text => text},
});
test('image selection uses ready memory bytes without a disk-read race', () => {
    const bytes = png();
    let selected;
    actions.setClipboardEntry({kind: 'image', _bytes: bytes}, {
        set_content(type, mime, data) { selected = {type, mime, data}; },
    });
    assert.deepEqual(selected, {type: 0, mime: 'image/png', data: bytes});
});
test('all paste accelerators release keys in reverse order', () => {
    for (const [mode, keys] of [['ctrl-v', [29, 47]], ['ctrl-shift-v', [29, 42, 47]], ['shift-insert', [42, 110]]]) {
        const events = [];
        actions.sendPaste({_settings: {get_string: () => mode}, _device: {
            notify_key(_time, key, state) { events.push([key, state]); },
        }});
        assert.deepEqual(events, [...keys.map(k => [k, 1]), ...keys.reverse().map(k => [k, 0])]);
    }
});
test('a partial paste-injection failure still releases modifiers', () => {
    const events = [];
    actions.sendPaste({_settings: {get_string: () => 'ctrl-v'}, _device: {
        notify_key(_time, key, state) {
            if (key === 47 && state === 1)
                throw new Error('device failure');
            events.push([key, state]);
        },
    }});
    assert.deepEqual(events, [[29, 1], [29, 0]]);
});
test('one failed key release does not skip releasing remaining modifiers', () => {
    const released = [];
    actions.sendPaste({_settings: {get_string: () => 'ctrl-shift-v'}, _device: {
        notify_key(_time, key, state) {
            if (state === 0) {
                released.push(key);
                if (key === 47)
                    throw new Error('release failure');
            }
        },
    }});
    assert.deepEqual(released, [47, 42, 29]);
});
test('dialogs release their modal grab before actor destruction', () => {
    const calls = [];
    const ext = {_dialog: {popModal() { calls.push('pop'); }, destroy() { calls.push('destroy'); }}};
    actions.closeDialog(ext);
    assert.deepEqual(calls, ['pop', 'destroy']);
    assert.equal(ext._dialog, null);
});
const {default: Extension} = await load('../extension/extension.js', {
    'gi://Clutter': {default: Clutter}, 'gi://Meta': {default: Meta},
    'gi://Shell': {default: {}}, 'gi://St': {default: St},
    [mainPath]: main,
    'resource:///org/gnome/shell/ui/panelMenu.js': {},
    'resource:///org/gnome/shell/ui/popupMenu.js': {},
    'resource:///org/gnome/shell/extensions/extension.js': {Extension: class {}, gettext: text => text},
    './history.js': {History}, './capture.js': {Capture, excludedApplication}, './actions.js': {...actions},
    './menu.js': {rebuildMenu() {}, rebuildPanelMenu() {}, releaseMenu() {}},
});
function pasteFixture() {
    const ext = new Extension();
    const target = {};
    const queue = [], events = [];
    global.display = {focus_window: target};
    global.stage = {get_key_focus: () => null};
    global.get_pointer = () => [0, 0, 0];
    ext._later = (_ms, callback) => queue.push(callback);
    ext._selectionSerial = 1;
    ext._menu = {isOpen: false};
    ext._indicator = {menu: {isOpen: false}};
    ext._settings = {get_string: () => 'ctrl-v'};
    ext._device = {notify_key(_time, key, state) { events.push([key, state]); }};
    return {ext, target, queue, events};
}
test('paste is cancelled when the focused window changes', () => {
    const {ext, target, queue, events} = pasteFixture();
    ext._waitToPaste(target, 1, 0);
    global.display.focus_window = {};
    queue.shift()();
    assert.equal(events.length, 0);
});
test('paste is cancelled when clipboard ownership changes', () => {
    const {ext, target, queue, events} = pasteFixture();
    ext._waitToPaste(target, 1, 0);
    ext._selectionSerial++;
    queue.shift()();
    assert.equal(events.length, 0);
});
test('an echo of our own selection does not cancel the paste, a later change does', () => {
    const {ext} = pasteFixture();
    ext._capture = {changed() {}};
    ext._ownSelectionUntil = GLib.get_monotonic_time() + 500000;
    ext._ownerChanged(Meta.SelectionType.SELECTION_CLIPBOARD);
    assert.equal(ext._selectionSerial, 1);
    ext._ownSelectionUntil = GLib.get_monotonic_time() - 1;
    ext._ownerChanged(Meta.SelectionType.SELECTION_CLIPBOARD);
    assert.equal(ext._selectionSerial, 2);
});
test('paste waits for held modifiers to be released', () => {
    const {ext, target, queue, events} = pasteFixture();
    global.get_pointer = () => [0, 0, Clutter.ModifierType.CONTROL_MASK];
    ext._waitToPaste(target, 1, 0);
    queue.shift()();
    assert.equal(events.length, 0);
    global.get_pointer = () => [0, 0, 0];
    queue.shift()();
    assert.equal(events.length, 4);
});
test('paste is not injected into a system modal dialog', () => {
    const {ext, target, queue, events} = pasteFixture();
    modules.get(mainPath).setExport('modalCount', 1);
    ext._waitToPaste(target, 1, 0);
    queue.shift()();
    modules.get(mainPath).setExport('modalCount', 0);
    assert.equal(events.length, 0);
});

let failed = 0;
for (const {name, fn} of tests) {
    try {
        await fn();
        console.log(`PASS ${name}`);
    } catch (error) {
        failed++;
        console.error(`FAIL ${name}\n${error.stack}`);
    }
}
console.log(`${tests.length - failed}/${tests.length} tests passed`);
process.exitCode = failed ? 1 : 0;
