// Run with: npm test
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
    CASES, base64Decode, base64Encode, convertTimestamp, countText, decodeJwt,
    formatJson, minifyJson, password, relativeTime, urlDecode, urlEncode, uuidV4,
} from '../core/devtools.js';

test('base64 round-trips UTF-8 and matches Node', () => {
    for (const text of ['', 'a', 'hello', 'héllo wörld ✓', 'ሰላም']) {
        assert.equal(base64Encode(text), Buffer.from(text).toString('base64'));
        assert.equal(base64Decode(base64Encode(text)), text);
    }
    assert.equal(base64Encode('??>', {urlSafe: true}), Buffer.from('??>').toString('base64url'));
    assert.equal(base64Decode(Buffer.from('??>').toString('base64url')), '??>');
    assert.throws(() => base64Decode('not base64!'), /Not valid Base64/);
});

test('json format and minify, with a clear error', () => {
    assert.equal(formatJson('{"a":[1,2]}'), '{\n  "a": [\n    1,\n    2\n  ]\n}');
    assert.equal(minifyJson('{ "a" : 1 }'), '{"a":1}');
    assert.throws(() => formatJson('{"a":}'), /^Error: Invalid JSON/);
});

test('jwt decode with expiry summary', () => {
    const enc = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const now = Date.UTC(2026, 8, 27, 12);
    const token = `${enc({alg: 'HS256', typ: 'JWT'})}.${enc({sub: '42', exp: now / 1000 + 7200})}.sig`;
    const {header, payload, summary} = decodeJwt(token, now);
    assert.equal(header.alg, 'HS256');
    assert.equal(payload.sub, '42');
    assert.equal(summary, 'HS256 · sub 42 · expires in 2 hours');
    assert.match(decodeJwt(`${enc({alg: 'RS256'})}.${enc({exp: now / 1000 - 86400 * 3})}.x`, now).summary,
        /expired 3 days ago/);
    assert.throws(() => decodeJwt('abc', now), /Not a JWT/);
});

test('url encode/decode', () => {
    assert.equal(urlEncode('a b&c=d/é'), 'a%20b%26c%3Dd%2F%C3%A9');
    assert.equal(urlDecode('a+b%20c'), 'a b c');
    assert.throws(() => urlDecode('%E0%A4%A'), /Not valid URL/);
});

test('timestamps both ways', () => {
    const now = Date.UTC(2026, 8, 27);
    assert.equal(convertTimestamp('1700000000', now).output, '2023-11-14T22:13:20.000Z');
    assert.equal(convertTimestamp('1700000000000', now).output, '2023-11-14T22:13:20.000Z');
    assert.equal(convertTimestamp('2023-11-14T22:13:20Z', now).output, '1700000000');
    assert.throws(() => convertTimestamp('yesterday-ish', now), /Not a timestamp/);
});

test('relative time', () => {
    assert.equal(relativeTime(90 * 60 * 1000), 'in 1 hour');
    assert.equal(relativeTime(-2 * 864e5), '2 days ago');
    assert.equal(relativeTime(5000), 'just now');
});

test('case conversions', () => {
    assert.equal(CASES.camel('hello_world-foo bar'), 'helloWorldFooBar');
    assert.equal(CASES.snake('helloWorldHTTPServer'), 'hello_world_http_server');
    assert.equal(CASES.kebab('Hello World'), 'hello-world');
    assert.equal(CASES.constant('apiKey'), 'API_KEY');
    assert.equal(CASES.pascal('user-id'), 'UserId');
    assert.equal(CASES.title('ask_bar'), 'Ask Bar');
});

test('uuid v4 format', () => {
    const uuid = uuidV4(new Uint8Array(16).fill(255));
    assert.match(uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('password uses only the alphabet, without modulo bias', () => {
    const bytes = Uint8Array.from({length: 256}, (_, i) => i);
    const pw = password(bytes, 20, 'abc');
    assert.equal(pw.length, 20);
    assert.match(pw, /^[abc]+$/);
    // 255 would bias a 3-letter alphabet (256 % 3 = 1), so it must be skipped.
    assert.throws(() => password(Uint8Array.of(255, 255), 1, 'abc'), /Not enough/);
});

test('count', () => {
    assert.equal(countText('hello world\nbye'), '15 characters · 3 words · 2 lines');
});
