import assert from 'node:assert/strict';
import {test} from 'node:test';

import {homeResults, normalizeFavorites, toggleFavorite} from '../core/favorites.js';

test('favorites survive serialization in pin order and toggle without duplicates', () => {
    const app = {id: 'app:org.gnome.Nautilus.desktop', title: 'Files'};
    const project = {id: 'file:/home/me/a project', title: 'a project', isFolder: true, isProject: true};
    const pins = toggleFavorite(toggleFavorite([], app), project);
    assert.deepEqual(normalizeFavorites(JSON.stringify(pins)), [app, project]);
    assert.deepEqual(toggleFavorite(pins, app), [project]);
    assert.deepEqual(toggleFavorite(toggleFavorite(pins, app), app), [project, app]);
});

test('favorites discard corrupt entries, duplicates and transient or sensitive data', () => {
    for (const text of ['bad json', 'null', '{}', '42'])
        assert.deepEqual(normalizeFavorites(text), []);
    const items = [null, {}, {id: 'window:42', title: 'Window'}, {id: 'file:relative', title: 'Bad path'},
        {id: 'cmd:json', title: 'JSON', output: 'secret', command: 'arbitrary shell'},
        {id: 'cmd:json', title: 'Duplicate'}, {id: 'app:x', title: 42}];
    assert.deepEqual(normalizeFavorites(JSON.stringify(items)), [{id: 'cmd:json', title: 'JSON'}]);
});

test('home shows all pins first, excludes duplicates and fills remaining slots', () => {
    const pins = [{id: 'app:a'}, {id: 'file:/b'}];
    const frequent = [{id: 'app:a'}, {id: 'app:c'}, {id: 'app:d'}];
    assert.deepEqual(homeResults(pins, frequent, 3), [...pins, frequent[1]]);
    assert.deepEqual(homeResults(pins, frequent, 1), pins);
    assert.deepEqual(homeResults([], frequent, 2), frequent.slice(0, 2));
});

test('custom command references retain punctuation and non-ASCII names', () => {
    const command = {id: 'cmd:déploy.dev', title: 'Déploy.dev'};
    assert.deepEqual(toggleFavorite([], command), [command]);
});
