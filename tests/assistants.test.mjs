// Run with: npm test
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {matchAssistant} from '../core/assistants.js';

test('recognizes Claude and ChatGPT by desktop id', () => {
    assert.equal(matchAssistant({id: 'com.anthropic.Claude.desktop', executable: null}).key, 'claude');
    assert.equal(matchAssistant({id: 'chatgpt.desktop', executable: null}).key, 'chatgpt');
});

test('recognizes them by executable when the id is unusual', () => {
    assert.equal(matchAssistant({id: 'x.desktop', executable: '/opt/bin/claude-desktop'}).key, 'claude');
    assert.equal(matchAssistant({id: 'y.desktop', executable: 'chatgpt'}).key, 'chatgpt');
});

test('ignores unrelated apps, including Claude Code', () => {
    assert.equal(matchAssistant({id: 'org.gnome.Nautilus.desktop', executable: 'nautilus'}), null);
    assert.equal(matchAssistant({id: 'claude-code-url-handler.desktop', executable: 'claude'}), null);
});

test('builds links with the question encoded', () => {
    const claude = matchAssistant({id: 'com.anthropic.Claude.desktop', executable: null});
    assert.equal(claude.link('what is json?'), 'claude://claude.ai/new?q=what%20is%20json%3F');
    const chatgpt = matchAssistant({id: 'chatgpt.desktop', executable: null});
    assert.equal(chatgpt.link('a & b'), 'https://chatgpt.com/?q=a%20%26%20b');
});
