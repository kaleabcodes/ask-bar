import St from 'gi://St';

import {searchHelp} from '../core/help.js';

export function helpEntry() {
    return row({id: 'help:open', title: 'Ask Bar Help',
        subtitle: 'Search tips, keyboard shortcuts and examples · /help', fill: '/help ', score: 0});
}

export function helpResults(query) {
    const results = searchHelp(query);
    return results.length ? results.map(row) : [row({
        id: 'help:empty', title: 'No matching help topics',
        subtitle: 'Try files, favorites, keyboard or JSON · Enter to browse all', fill: '/help ', score: 0,
    })];
}

function row(item) {
    return {...item, kind: item.fill ? 'Try it' : 'Help', activate: null,
        createIcon: () => new St.Icon({icon_name: 'help-browser-symbolic', icon_size: 32})};
}
