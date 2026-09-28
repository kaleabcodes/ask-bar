// Run with: npm test
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {EDITORS, TERMINALS, editorArgv, matchApp} from '../core/devApps.js';
import {hostLabel, parseHead, parseRemoteUrl, remoteToWeb, webUrlFor} from '../core/gitRemote.js';
import {isLearnable, learnedBonus, normalizeQuery, recordChoice} from '../core/learning.js';

const DAY = 864e5;

test('learning: a choice boosts that result for the query and related queries', () => {
    const h = {};
    recordChoice(h, 'te', 'app:org.gnome.Ptyxis.desktop', 0);
    const exact = learnedBonus(h, 'Te ', 'app:org.gnome.Ptyxis.desktop', 0);
    const longer = learnedBonus(h, 'ter', 'app:org.gnome.Ptyxis.desktop', 0);
    assert.ok(exact > 0 && longer > 0 && exact > longer);
    assert.equal(learnedBonus(h, 'fire', 'app:org.gnome.Ptyxis.desktop', 0), 0);
    assert.equal(learnedBonus(h, 'te', 'app:other', 0), 0);
});

test('learning: repeated choices count more, capped, and fade with time', () => {
    const h = {};
    recordChoice(h, 'te', 'app:t', 0);
    const once = learnedBonus(h, 'te', 'app:t', 0);
    for (let i = 0; i < 20; i++)
        recordChoice(h, 'te', 'app:t', 0);
    const many = learnedBonus(h, 'te', 'app:t', 0);
    assert.ok(many > once && many <= 60);
    // A single choice fades to under a third of its boost after four weeks.
    const single = {};
    recordChoice(single, 'te', 'app:t', 0);
    assert.ok(learnedBonus(single, 'te', 'app:t', 28 * DAY) < once / 3);
});

test('learning: unstable ids are not learned', () => {
    assert.equal(isLearnable('window:123'), false);
    assert.equal(isLearnable('web:g:x'), false);
    assert.equal(isLearnable('file:/home/a'), true);
    assert.deepEqual(recordChoice({}, 'x', 'calc:result', 0), {});
    assert.equal(normalizeQuery('  Foo   Bar '), 'foo bar');
});

test('learning: keeps at most 300 queries, dropping the oldest', () => {
    const h = {};
    for (let i = 0; i < 310; i++)
        recordChoice(h, `q${i}`, 'app:a', i);
    assert.equal(Object.keys(h).length, 300);
    assert.ok(!('q0' in h) && 'q309' in h);
});

test('git: remote URLs to web pages', () => {
    const config = '[core]\n\tbare = false\n[remote "origin"]\n\turl = git@github.com:kaleabcodes/ask-bar.git\n[branch "main"]\n';
    assert.equal(parseRemoteUrl(config), 'git@github.com:kaleabcodes/ask-bar.git');
    assert.deepEqual(remoteToWeb('git@github.com:kaleabcodes/ask-bar.git'),
        {host: 'github.com', web: 'https://github.com/kaleabcodes/ask-bar'});
    assert.equal(remoteToWeb('https://user:tok@gitlab.com/g/sub/p.git').web, 'https://gitlab.com/g/sub/p');
    assert.equal(remoteToWeb('ssh://git@bitbucket.org:22/team/repo.git').web, 'https://bitbucket.org/team/repo');
    assert.equal(remoteToWeb('/local/path/repo'), null);
    assert.equal(parseRemoteUrl('[remote "upstream"]\n\turl = x\n'), null);
});

test('git: links to files and folders per host', () => {
    const gh = remoteToWeb('git@github.com:me/r.git');
    assert.equal(webUrlFor(gh, 'main', 'core/a b.js', false), 'https://github.com/me/r/blob/main/core/a%20b.js');
    assert.equal(webUrlFor(gh, 'main', 'core', true), 'https://github.com/me/r/tree/main/core');
    assert.equal(webUrlFor(gh, 'main', '', true), 'https://github.com/me/r');
    assert.equal(webUrlFor(gh, null, 'x.js', false), 'https://github.com/me/r');
    const gl = remoteToWeb('git@gitlab.com:me/r.git');
    assert.equal(webUrlFor(gl, 'dev', 'x.js', false), 'https://gitlab.com/me/r/-/blob/dev/x.js');
    assert.equal(parseHead('ref: refs/heads/feature/x\n'), 'feature/x');
    assert.equal(parseHead('3f2a9c1'), null);
    assert.equal(hostLabel('github.com'), 'GitHub');
});

test('apps: editors and terminals by desktop id', () => {
    assert.equal(matchApp('code_code.desktop', EDITORS).key, 'code');
    assert.equal(matchApp('cursor.desktop', EDITORS).key, 'cursor');
    assert.equal(matchApp('jetbrains-webstorm-ba9b297f-868b-4a2d-919b-62ab1323830c.desktop', EDITORS).key, 'webstorm');
    assert.equal(matchApp('cursor-url-handler.desktop', EDITORS), null);
    assert.equal(matchApp('org.gnome.Ptyxis.desktop', TERMINALS).argv('/p').join(' '), 'ptyxis --new-window -d /p');
    assert.equal(matchApp('com.mitchellh.ghostty.desktop', TERMINALS).argv('/p')[1], '--working-directory=/p');
    const labels = TERMINALS.map(t => t.label);
    assert.equal(new Set(labels).size, labels.length, 'terminal labels are distinct');
});

test('apps: editor command lines get a plain path', () => {
    assert.deepEqual(editorArgv(['/usr/share/cursor/cursor', '%F'], '/a b'), ['/usr/share/cursor/cursor', '/a b']);
    assert.deepEqual(editorArgv(['/opt/webstorm', '%u'], '/p'), ['/opt/webstorm', '/p']);
    assert.deepEqual(editorArgv(['gnome-builder'], '/p'), ['gnome-builder', '/p']);
    assert.deepEqual(editorArgv(['x', '--icon', '%i', '%U', '%U'], '/p'), ['x', '--icon', '/p']);
});
