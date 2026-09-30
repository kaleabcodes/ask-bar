import St from 'gi://St';

import {homeResults, normalizeFavorites, toggleFavorite} from '../core/favorites.js';

export class FavoritesProvider {
    constructor(settings, resolve) {
        this._settings = settings;
        this._resolve = resolve;
    }

    _items() {
        return normalizeFavorites(this._settings.get_string('pinned-favorites'));
    }

    decorate(results) {
        const ids = new Set(this._items().map(item => item.id));
        return results.map(result => {
            if (!result.favorite)
                return result;
            const pinned = ids.has(result.id);
            return {
                ...result,
                kind: pinned ? `Pinned · ${result.kind}` : result.kind,
                actions: () => [{
                    id: `favorite:${result.id}`,
                    title: pinned ? 'Unpin from Favorites' : 'Pin to Favorites',
                    subtitle: pinned ? 'Remove from the start of the bar' : 'Show at the start of the bar',
                    kind: '', score: 0,
                    createIcon: () => new St.Icon({icon_name: pinned ? 'starred-symbolic' : 'non-starred-symbolic', icon_size: 32}),
                    keepOpen: true,
                    activate: () => {
                        const items = toggleFavorite(this._items(), result.favorite);
                        if (!this._settings.set_string('pinned-favorites', JSON.stringify(items)))
                            throw new Error('Favorites could not be saved');
                    },
                }, ...(result.actions?.() ?? [])],
            };
        });
    }

    home(frequent, limit) {
        const favorites = this._items().map(item => this._resolve(item) ?? {
            id: item.id, title: item.title,
            subtitle: 'Unavailable · Alt+Enter to unpin',
            kind: 'Unavailable', score: 0, activate: null, favorite: item,
            createIcon: () => new St.Icon({icon_name: 'dialog-warning-symbolic', icon_size: 32}),
        });
        return this.decorate(homeResults(favorites, frequent, limit));
    }

    destroy() {}
}
