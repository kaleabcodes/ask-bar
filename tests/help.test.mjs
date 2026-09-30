import assert from 'node:assert/strict';
import {test} from 'node:test';

import {HELP_TOPICS, searchHelp} from '../core/help.js';
import {MODES, parse} from '../core/parse.js';

test('/help is a dedicated mode without taking over other commands and paths', () => {
    assert.deepEqual(parse(' /help JSON '), {mode: MODES.HELP, prefix: '/help ', query: 'JSON'});
    assert.equal(parse('/HELP').mode, MODES.HELP);
    assert.equal(parse('/helper').mode, MODES.COMMANDS);
    assert.equal(parse('/help/file').mode, MODES.ALL);
    assert.equal(parse('/help /json').mode, MODES.HELP);
    assert.equal(parse('? help').mode, MODES.AI);
});

test('help browses every topic and finds feature names, prefixes and keyboard controls', () => {
    assert.equal(searchHelp('').length, HELP_TOPICS.length);
    assert.equal(searchHelp('favorites')[0].id, 'help:favorites');
    assert.equal(searchHelp('json')[0].fill, '/json {"hello":"world"}');
    assert.equal(searchHelp('@')[0].id, 'help:files');
    assert.ok(searchHelp('keyboard').some(r => r.id === 'help:navigation'));
    assert.equal(searchHelp('zzzzzzzzzzzz').length, 0);
});

test('help examples use supported modes and keep instructional rows non-executable', () => {
    const entries = searchHelp('');
    assert.equal(new Set(entries.map(r => r.id)).size, entries.length);
    for (const entry of entries) {
        assert.ok(!('activate' in entry));
        if (entry.fill)
            assert.ok(Object.values(MODES).includes(parse(entry.fill).mode));
    }
    assert.equal(entries.find(r => r.id === 'help:favorites').fill, undefined);
});
