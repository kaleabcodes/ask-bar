// Exercise the overlay controller without a running desktop.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
import {MODES, parse} from '../core/parse.js';

function controller(search) {
    const notifications = [];
    const context = {
        MODES, parse, Promise, console,
        St: {Widget: class {}, Icon: class {}, ThemeContext: {get_for_stage: () => ({scale_factor: 1})}},
        Gio: {Cancellable: class { cancel() {} }},
        GObject: {registerClass: cls => cls},
        Clutter: {},
        Main: {
            popModal() {},
            notifyError: (...args) => notifications.push(args),
            layoutManager: {
                currentMonitor: {index: 0},
                getWorkAreaForMonitor: () => ({x: 100, y: 24, width: 800, height: 576}),
            },
        },
        global: {stage: {}},
        isCancelled: () => false,
        ensureActorVisibleInScrollView() {},
        ResultRow: class { connect() {} setSelected() {} },
    };
    const source = readFileSync(new URL('../ui/bar.js', import.meta.url), 'utf8')
        .replace(/^import .*;\n/gm, '')
        .replace('export const AskBar =', 'globalThis.AskBar =');
    vm.runInNewContext(source, context);
    const bar = Object.create(context.AskBar.prototype);
    Object.assign(bar, {
        _search: search, _generation: 0, _cancellable: null, _grab: {},
        _actionsFor: null, _results: [], _selected: 0, _userSelected: false,
        _rows: [], _list: {destroy_all_children() {}, add_child() {}},
        _entry: {text: '@old'}, _modeIcon: {}, _chip: {}, _enterHintLabel: {},
        _enterHint: {}, _escapeHintLabel: {}, _actionsHint: {}, _altHint: {},
        _altHintLabel: {}, _fillHint: {}, _contextHints: {},
        _footer: {visible: true},
        _settings: {
            get_string: () => 'pointer',
            get_boolean: () => false,
            get_int: key => ({'panel-width': 680, 'panel-position': 50})[key],
        },
        _scroll: {set_style(style) { this.style = style; }},
        _panel: {set_pivot_point() {}, set_position(x, y) { this.x = x; this.y = y; }},
        hide() {},
        _setResults(results, mode) { this._results = results; this._resultsMode = mode; },
    });
    return {bar, notifications};
}

const deferred = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return {promise, resolve};
};

test('closing invalidates late results, even when the provider ignores cancellation', async () => {
    for (const progressive of [false, true]) {
        const pending = deferred();
        const {bar} = controller(() => progressive ? {results: [], more: pending.promise} : pending.promise);
        bar._update();
        bar.close();
        pending.resolve([{id: 'late'}]);
        await pending.promise;
        assert.equal(bar._results.length, 0);
        assert.equal(bar.isOpen, false);
    }
});

test('a new async query replaces actionable matches with a loading state', async () => {
    const pending = deferred();
    const {bar} = controller(() => pending.promise);
    bar._resultsMode = MODES.FILES;
    bar._results = [{id: 'old', activate() { assert.fail('stale item activated'); }}];
    bar._update();
    assert.equal(bar._results[0].id, 'status:searching');
    assert.equal(bar._results[0].activate, null);
    bar._activate(0);
    pending.resolve([{id: 'new'}]);
    await pending.promise;
    assert.equal(bar._results[0].id, 'new');
});

test('superseded searches cannot replace newer results', async () => {
    const old = deferred();
    const {bar} = controller(() => old.promise);
    bar._update();
    bar._search = () => [{id: 'new'}];
    bar._entry.text = '@new';
    bar._update();
    old.resolve([{id: 'old'}]);
    await old.promise;
    assert.equal(bar._results[0].id, 'new');
});

test('layout leaves space below the bar on short monitors', () => {
    const {bar} = controller();
    bar._placePanel();
    assert.equal(bar._panel.x, 160);
    assert.equal(bar._panel.y, 312);
    assert.equal(bar._scroll.style, 'max-height: 104px;');
});

test('empty states explain how to continue and do not advertise an Enter action', () => {
    const {bar} = controller();
    delete bar._setResults;
    bar._setResults([], MODES.MATH);
    assert.equal(bar._results[0].title, 'Calculate or convert');
    assert.ok(bar._results[0].subtitle.includes('10 km in mi'));
    assert.equal(bar._enterHint.visible, false);
    bar._setResults([], 'actions');
    assert.equal(bar._results[0].title, 'No matching actions');
    bar._setResults([], null);
    assert.equal(bar._results.length, 0);
    assert.equal(bar._scroll.visible, false);
});

test('Enter hints follow the selected result and Escape goes back from actions', () => {
    const {bar} = controller();
    delete bar._setResults;
    bar._setResults([{id: 'calc:result', activate() {}, activateLabel: 'Copy'}], MODES.ALL);
    assert.equal(bar._enterHintLabel.text, 'Copy');
    assert.equal(bar._enterHint.visible, true);
    bar._setResults([{id: 'help', fill: '/help '}], MODES.ALL);
    assert.equal(bar._enterHintLabel.text, 'Complete');
    assert.equal(bar._contextHints.visible, true);
    bar._actionsFor = {};
    bar._setResults([{id: 'action:open', activate() {}}], 'actions');
    assert.equal(bar._escapeHintLabel.text, 'Back');
    assert.equal(bar._enterHintLabel.text, 'Run');
});

test('action failures are reported after releasing the modal grab', async () => {
    for (const async of [false, true]) {
        const {bar, notifications} = controller();
        bar._onActivated = () => {};
        bar._results = [{id: 'broken', activate: () => {
            assert.equal(bar.isOpen, false);
            if (async)
                return Promise.reject(new Error('Unavailable'));
            throw new Error('Unavailable');
        }}];
        bar._activate(0);
        await Promise.resolve();
        assert.equal(notifications[0][1], 'Unavailable');
    }
});
