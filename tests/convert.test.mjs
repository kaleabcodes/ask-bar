// Run with: npm test
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {evaluate, looksLikeMath} from '../core/calc.js';
import {
    addEntry, describeEntry, relativeTime, removeEntry, searchEntries, summarize,
} from '../core/clipboard.js';
import {
    convertCurrency, convertUnits, formatBase, formatMoney, formatQuantity, parseConversion, UNITS,
} from '../core/convert.js';
import {allGlyphs, searchGlyphs} from '../core/emoji.js';
import {searchHelp} from '../core/help.js';
import {isLearnable} from '../core/learning.js';
import {MODES, parse} from '../core/parse.js';

// ── Calculator ───────────────────────────────────────────────────────

test('calc: percentages', () => {
    assert.equal(evaluate('20% of 80'), 16);
    assert.equal(evaluate('80 + 20%'), 96);
    assert.equal(evaluate('80 - 20%'), 64);
    assert.equal(evaluate('100 * 15%'), 15);
    assert.equal(evaluate('50%'), 0.5);
    assert.equal(evaluate('10 % 4'), 2, 'a value after % keeps modulo');
    assert.equal(evaluate('10 % (3)'), 1);
    assert.ok(looksLikeMath('20% of 80'));
});

test('calc: hex, binary and octal literals', () => {
    assert.equal(evaluate('0xff'), 255);
    assert.equal(evaluate('0xFF + 1'), 256);
    assert.equal(evaluate('0b1010'), 10);
    assert.equal(evaluate('0o17'), 15);
    assert.ok(looksLikeMath('0xff'), 'a bare base literal is worth showing');
    assert.equal(looksLikeMath('255'), false);
    assert.throws(() => evaluate('0b102'));
    assert.throws(() => evaluate('0xfg'));
});

// ── Conversions ──────────────────────────────────────────────────────

const unitResult = text => {
    const c = parseConversion(text);
    assert.equal(c?.kind, 'unit', text);
    return `${formatQuantity(c.result)} ${c.to.symbol}`;
};

test('convert: units', () => {
    assert.equal(unitResult('10 km in mi'), '6.2137 mi');
    assert.equal(unitResult('10km to mi'), '6.2137 mi');
    assert.equal(unitResult('(10 + 5) km in m'), '15000 m');
    assert.equal(unitResult('5 ft to m'), '1.524 m');
    assert.equal(unitResult('10 in to cm'), '25.4 cm', '"in" is inches when "to" separates');
    assert.equal(unitResult('72 f in c'), '22.2222 °C');
    assert.equal(unitResult('0 c in k'), '273.15 K');
    assert.equal(unitResult('100 km/h in mph'), '62.1371 mph');
    assert.equal(unitResult('1 gb in mb'), '1000 MB');
    assert.equal(unitResult('1 gib in mib'), '1024 MiB');
    assert.equal(unitResult('3 hours in minutes'), '180 min');
    assert.equal(unitResult('10 sq ft in m2'), '0.92903 m²');
    assert.equal(unitResult('5 square meters in sq ft'), '53.8196 ft²');
    assert.equal(unitResult('90 deg in rad'), '1.5708 rad');
});

test('convert: ambiguous words resolve by compatibility', () => {
    assert.equal(unitResult('10 pounds in kg'), '4.5359 kg');
    const money = parseConversion('10 pounds in euros');
    assert.deepEqual([money.kind, money.fromCode, money.toCode, money.value], ['currency', 'GBP', 'EUR', 10]);
});

test('convert: currencies parse; arithmetic uses the given rates', () => {
    const c = parseConversion('$20 in eur');
    assert.deepEqual([c.kind, c.value, c.fromCode, c.toCode], ['currency', 20, 'USD', 'EUR']);
    assert.equal(parseConversion('20 usd to etb').toCode, 'ETB');
    assert.equal(parseConversion('€5 to birr').fromCode, 'EUR');
    const rates = {USD: 1, EUR: 0.5, ETB: 50};
    assert.equal(convertCurrency(20, 'USD', 'EUR', rates), 10);
    assert.equal(convertCurrency(10, 'EUR', 'ETB', rates), 1000);
    assert.throws(() => convertCurrency(1, 'USD', 'XXX', rates), /XXX/);
    assert.equal(formatMoney(1234.5), '1,234.50');
    assert.equal(formatMoney(0.00123), '0.00123');
});

test('convert: number bases', () => {
    const c = parseConversion('255 to hex');
    assert.deepEqual([c.kind, c.value, c.base], ['base', 255, 16]);
    assert.equal(formatBase(255, 16), '0xff');
    assert.equal(formatBase(-255, 16), '-0xff');
    assert.equal(formatBase(10, 2), '0b1010');
    assert.equal(formatBase(parseConversion('0xff to bin').value, 2), '0b11111111');
    assert.equal(formatBase(parseConversion('0b1111 in dec').value, 10), '15');
    assert.equal(parseConversion('1.5 to hex').kind, 'error');
});

test('convert: only real requests, with clear errors', () => {
    assert.equal(parseConversion('firefox'), null);
    assert.equal(parseConversion('log in to github'), null);
    assert.equal(parseConversion('10 in cm'), null, 'no source unit');
    assert.equal(parseConversion('10 km in bananas'), null);
    assert.match(parseConversion('10 km in kg').message, /length to mass/);
    assert.equal(parseConversion('10 km in eur').kind, 'error');
});

test('convert: every unit alias is unique within its category and symbols are set', () => {
    const seen = new Map();
    for (const unit of UNITS) {
        assert.ok(unit.symbol && unit.category);
        for (const alias of unit.aliases) {
            const key = `${unit.category}:${alias.toLowerCase()}`;
            assert.ok(!seen.has(key), `duplicate alias ${alias} in ${unit.category}`);
            seen.set(key, unit);
        }
    }
    const km = UNITS.find(u => u.symbol === 'km');
    const mi = UNITS.find(u => u.symbol === 'mi');
    assert.ok(Math.abs(convertUnits(1, mi, km) - 1.609344) < 1e-9);
});

test('convert: quantity formatting is readable', () => {
    assert.equal(formatQuantity(6.21371192237), '6.2137');
    assert.equal(formatQuantity(15000), '15000');
    assert.equal(formatQuantity(0.000001), '1e-6');
    assert.equal(formatQuantity(0.92903), '0.92903');
});

// ── Emoji ────────────────────────────────────────────────────────────

test('emoji: data is well formed and searchable', () => {
    const all = allGlyphs();
    assert.ok(all.length > 1500);
    for (const g of all) {
        assert.ok(g.char && g.name && g.group, JSON.stringify(g));
        assert.ok(!g.name.includes('|'));
    }
    assert.equal(parse(':fire').mode, MODES.EMOJI);
    assert.equal(parse(':fire').query, 'fire');
    assert.equal(searchGlyphs('fire', 5)[0].char, '🔥');
    assert.equal(searchGlyphs(':fire:', 5)[0].char, '🔥', 'colons around a shortcode are ignored');
    assert.equal(searchGlyphs('thumbs up', 5)[0].char, '👍');
    assert.equal(searchGlyphs('shrug', 5)[0].name, 'shrug');
    assert.equal(searchGlyphs('right arrow', 5)[0].char, '→');
    assert.equal(searchGlyphs('lol', 5)[0].char, '😄', 'an exact keyword beats a name prefix');
    assert.equal(searchGlyphs('ok', 5)[0].char, '👌', 'a whole name word beats a keyword');
    assert.equal(searchGlyphs('', 3).length, 3);
    assert.equal(searchGlyphs('zzzzzzzz', 3).length, 0);
    assert.ok(isLearnable('emoji:🔥'), 'picked emoji are remembered');
});

// ── Clipboard history ────────────────────────────────────────────────

test('clipboard: entries are deduplicated, capped and searched by words', () => {
    let list = [];
    list = addEntry(list, 'hello world', 1000, 3);
    list = addEntry(list, 'second', 2000, 3);
    list = addEntry(list, '   ', 2500, 3);
    list = addEntry(list, 'hello world', 3000, 3);
    assert.deepEqual(list.map(e => e.text), ['hello world', 'second'], 'a repeat moves to the top');
    list = addEntry(list, 'third', 4000, 3);
    list = addEntry(list, 'fourth', 5000, 3);
    assert.deepEqual(list.map(e => e.text), ['fourth', 'third', 'hello world']);
    assert.deepEqual(searchEntries(list, 'WORLD hel', 10).map(e => e.text), ['hello world']);
    assert.deepEqual(searchEntries(list, '', 2).map(e => e.text), ['fourth', 'third']);
    assert.equal(searchEntries(list, 'nothing', 10).length, 0);
    assert.deepEqual(removeEntry(list, 'third').map(e => e.text), ['fourth', 'hello world']);
    assert.equal(addEntry([], 'x'.repeat(200_000), 1, 5).length, 0, 'oversized copies are not kept');
    assert.ok(!isLearnable('clip:123'), 'clipboard ids are not stable');
});

test('clipboard: rows summarize the text', () => {
    assert.equal(summarize('\n\n  first line here  \nsecond'), 'first line here');
    assert.equal(summarize('a'.repeat(100)).length, 81);
    const now = 10 * 60 * 1000;
    assert.equal(describeEntry({text: 'ab\ncd', time: 0}, now), '5 characters · 2 lines · 10 min ago');
    assert.equal(relativeTime(0, 30 * 1000), 'just now');
    assert.equal(relativeTime(0, 3 * 3600 * 1000), '3 h ago');
    assert.equal(relativeTime(0, 24 * 3600 * 1000), 'yesterday');
    assert.equal(parse('/clip token').mode, MODES.CLIPBOARD);
    assert.equal(parse('/clip token').query, 'token');
    assert.equal(parse('/clipper').mode, MODES.COMMANDS);
});

// ── Help ─────────────────────────────────────────────────────────────

test('help covers the new features', () => {
    assert.equal(searchHelp('emoji')[0].id, 'help:emoji');
    assert.equal(searchHelp('clipboard')[0].id, 'help:clipboard');
    assert.equal(searchHelp('currency')[0].id, 'help:convert');
    assert.ok(searchHelp('workspace').some(r => r.id === 'help:windows'));
    assert.equal(searchHelp('rank')[0].id, 'help:rank');
});
