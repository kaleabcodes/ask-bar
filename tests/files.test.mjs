// Run with: npm test
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
    displayFolder, parseLocalsearch, parseRecentFiles, pathToUri, scorePath, uriToPath,
} from '../core/files.js';

const HOME = '/home/kaleab';

test('uri <-> path round-trips, including spaces and symbols', () => {
    const path = '/home/kaleab/Desktop/AI Evaluation & RAGs.pdf';
    assert.equal(uriToPath(pathToUri(path)), path);
    assert.equal(uriToPath('https://example.com'), null);
});

test('parses localsearch output', () => {
    const out = 'file:///home/kaleab/Desktop/repo\nfile:///home/kaleab/repo%201\n\n';
    assert.deepEqual(parseLocalsearch(out), ['/home/kaleab/Desktop/repo', '/home/kaleab/repo 1']);
});

test('parses recent files newest first, skipping non-local and duplicates', () => {
    const xml = `
<bookmark href="file:///home/kaleab/a.txt" added="x" modified="2026-01-01T00:00:00Z">
<bookmark href="https://example.com/x" added="x" modified="2026-09-01T00:00:00Z">
<bookmark href="file:///home/kaleab/b%26c.txt" added="x" modified="2026-05-01T00:00:00Z">
<bookmark href="file:///home/kaleab/a.txt" added="x" modified="2025-01-01T00:00:00Z">`;
    assert.deepEqual(parseRecentFiles(xml), ['/home/kaleab/b&c.txt', '/home/kaleab/a.txt']);
});

test('real files beat SDK and dependency noise', () => {
    const readme = scorePath('readme', '/home/kaleab/Desktop/openApi/abol/README.md', {home: HOME});
    const sdk = scorePath('readme', '/home/kaleab/Android/Sdk/cmdline-tools/latest/lib/README', {home: HOME});
    const dep = scorePath('readme', '/home/kaleab/app/node_modules/x/README.md', {home: HOME});
    const goMod = scorePath('readme', '/home/kaleab/go/pkg/mod/cel.dev/expr@v0.25.2/README.md', {home: HOME});
    assert.ok(readme > sdk && readme > dep && readme > goMod);
});

test('exact names and projects rank higher', () => {
    const project = scorePath('ask-bar', '/home/kaleab/Desktop/repo/ask-bar', {home: HOME, isFolder: true, isProject: true});
    const file = scorePath('ask-bar', '/home/kaleab/Downloads/ask-bar-notes.txt', {home: HOME});
    assert.ok(project > file);
});

test('shallower paths win ties; non-matches return null', () => {
    const shallow = scorePath('notes', '/home/kaleab/notes.md', {home: HOME});
    const deep = scorePath('notes', '/home/kaleab/a/b/c/d/notes.md', {home: HOME});
    assert.ok(shallow > deep);
    assert.equal(scorePath('zzz', '/home/kaleab/notes.md', {home: HOME}), null);
});

test('matches folder names in the path', () => {
    assert.notEqual(scorePath('repo/ask', '/home/kaleab/Desktop/repo/ask-bar/README.md', {home: HOME}), null);
});

test('displays folders relative to home', () => {
    assert.equal(displayFolder('/home/kaleab/Desktop/x.txt', HOME), '~/Desktop');
    assert.equal(displayFolder('/etc/hosts', HOME), '/etc');
});

test('displays drive folders by drive name', () => {
    assert.equal(displayFolder('/run/media/kaleab/Local Disk/Projects/a.txt', HOME), 'Local Disk/Projects');
    assert.equal(displayFolder('/media/kaleab/USB/b.pdf', HOME), 'USB');
});
