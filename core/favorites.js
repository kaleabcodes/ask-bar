// Persistent favorites contain only stable references, never clipboard text,
// command output or executable command bodies. Pure JS for validation tests.
export function normalizeFavorites(text) {
    try {
        const data = JSON.parse(text);
        if (!Array.isArray(data))
            return [];
        const seen = new Set();
        return data.filter(item => {
            if (!item || typeof item.id !== 'string' || typeof item.title !== 'string' ||
                !/^(app:.+|cmd:.+|file:\/.*)$/.test(item.id) || seen.has(item.id))
                return false;
            seen.add(item.id);
            return true;
        }).map(({id, title, isFolder, isProject}) => ({
            id, title, ...(id.startsWith('file:') ? {isFolder: Boolean(isFolder), isProject: Boolean(isProject)} : {}),
        }));
    } catch {
        return [];
    }
}

export function toggleFavorite(favorites, item) {
    return normalizeFavorites(JSON.stringify(favorites.some(f => f.id === item.id)
        ? favorites.filter(f => f.id !== item.id) : [...favorites, item]));
}

// Every pin remains reachable, even when there are more pins than max-results.
export function homeResults(favorites, frequent, limit) {
    const ids = new Set(favorites.map(r => r.id));
    return [...favorites, ...frequent.filter(r => !ids.has(r.id)).slice(0, Math.max(0, limit - favorites.length))];
}
