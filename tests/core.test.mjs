// Run with: npm test
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {evaluate, formatNumber, looksLikeMath} from '../core/calc.js';
import {bestScore, fuzzyScore} from '../core/fuzzy.js';
import {MODES, parse} from '../core/parse.js';

test('parse: prefixes select a mode', () => {
    assert.deepEqual(parse('firefox'), {mode: MODES.ALL, prefix: '', query: 'firefox'});
    assert.deepEqual(parse('@readme'), {mode: MODES.FILES, prefix: '@', query: 'readme'});
    assert.deepEqual(parse('/ lock'), {mode: MODES.COMMANDS, prefix: '/', query: 'lock'});
    assert.deepEqual(parse('= 2*3'), {mode: MODES.MATH, prefix: '=', query: '2*3'});
    assert.deepEqual(parse('!gh gnome'), {mode: MODES.WEB, prefix: '!', query: 'gh gnome'});
    assert.deepEqual(parse('? what is dns'), {mode: MODES.AI, prefix: '?', query: 'what is dns'});
});

test('parse: a path starting with / is not a command', () => {
    assert.equal(parse('/usr/bin').mode, MODES.ALL);
});

test('fuzzy: prefix and word-start matches rank higher', () => {
    const firefox = fuzzyScore('fire', 'Firefox');
    const other = fuzzyScore('fire', 'Keyboard Configurator');
    assert.ok(firefox > (other ?? -Infinity));
    assert.ok(fuzzyScore('term', 'GNOME Terminal') > fuzzyScore('term', 'Determination'));
});

test('fuzzy: scattered matches work, missing letters do not', () => {
    assert.notEqual(fuzzyScore('vsc', 'Visual Studio Code'), null);
    assert.equal(fuzzyScore('xyz', 'Firefox'), null);
    assert.equal(fuzzyScore('', 'anything'), 0);
});

test('fuzzy: later fields count less', () => {
    const byName = bestScore('code', ['Code', 'editor']);
    const byKeyword = bestScore('code', ['Text Editor', 'code']);
    assert.ok(byName > byKeyword);
    assert.equal(bestScore('zzz', ['a', null, 'b']), null);
});

test('calc: precedence, power and parentheses', () => {
    assert.equal(evaluate('2 + 3 * 4'), 14);
    assert.equal(evaluate('(2 + 3) * 4'), 20);
    assert.equal(evaluate('2 ^ 3 ^ 2'), 512);
    assert.equal(evaluate('-2 ^ 2'), -4);
    assert.equal(evaluate('10 % 4'), 2);
    assert.equal(evaluate('6 × 7 ÷ 2'), 21);
});

test('calc: functions and constants', () => {
    assert.equal(evaluate('sqrt(16) + abs(-2)'), 6);
    assert.equal(evaluate('max(1, 5, 3)'), 5);
    assert.equal(formatNumber(evaluate('2 * pi')), '6.28318530718');
    assert.equal(evaluate('1e3 / 4'), 250);
});

test('calc: rejects invalid input instead of guessing', () => {
    for (const bad of ['2 +', '(1', '1 / 0', 'foo(2)', '2 $ 3', 'alert(1)'])
        assert.throws(() => evaluate(bad), bad);
});

test('calc: formatting removes floating-point noise', () => {
    assert.equal(formatNumber(0.1 + 0.2), '0.3');
    assert.equal(formatNumber(2691), '2691');
});

test('looksLikeMath: only real expressions', () => {
    assert.equal(looksLikeMath('2340 * 1.15'), true);
    assert.equal(looksLikeMath('sqrt(2)'), true);
    assert.equal(looksLikeMath('2024'), false);
    assert.equal(looksLikeMath('firefox'), false);
    assert.equal(looksLikeMath('e'), false);
    assert.equal(looksLikeMath('-5'), false);
    assert.equal(looksLikeMath('2 +'), false);
});
