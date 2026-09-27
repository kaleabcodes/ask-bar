// Run with: npm test
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {DEFAULT_BANGS, asUrl, buildUrl, mergeBangs, parseBang} from '../core/web.js';

test('parses a shortcut and its terms', () => {
    const {bang, key, terms} = parseBang('gh ask bar', DEFAULT_BANGS);
    assert.equal(bang.name, 'GitHub');
    assert.equal(key, 'gh');
    assert.equal(terms, 'ask bar');
    assert.equal(parseBang('GH x', DEFAULT_BANGS).bang.key, 'gh');
    assert.equal(parseBang('nope x', DEFAULT_BANGS).bang, null);
});

test('builds encoded URLs', () => {
    const yt = DEFAULT_BANGS.find(b => b.key === 'yt');
    assert.equal(buildUrl(yt, 'lo-fi & chill'), 'https://www.youtube.com/results?search_query=lo-fi%20%26%20chill');
});

test('custom shortcuts override defaults and need %s', () => {
    const bangs = mergeBangs([
        {key: '!G', name: 'My Google', url: 'https://example.com/?q=%s'},
        {key: 'bad', name: 'No placeholder', url: 'https://example.com'},
    ]);
    assert.equal(bangs.find(b => b.key === 'g').name, 'My Google');
    assert.equal(bangs.filter(b => b.key === 'g').length, 1);
    assert.equal(bangs.find(b => b.key === 'bad'), undefined);
});

test('detects URLs, not words or numbers', () => {
    assert.equal(asUrl('https://gnome.org/x'), 'https://gnome.org/x');
    assert.equal(asUrl('github.com/kaleabcodes'), 'https://github.com/kaleabcodes');
    assert.equal(asUrl('localhost:3000'), 'http://localhost:3000');
    assert.equal(asUrl('extensions.gnome.org'), 'https://extensions.gnome.org');
    for (const notUrl of ['firefox', '1.15', '2340 * 1.15', 'hello world', 'README.md5', ''])
        assert.equal(asUrl(notUrl), null, notUrl);
});
