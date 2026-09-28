// Finds a project's web page (GitHub, GitLab, Bitbucket, …) from its git
// config, for "Open on GitHub". Pure JavaScript, unit-tested with Node.

/**
 * The URL of a remote in .git/config (default "origin").
 *
 * @param {string} configText
 * @param {string} [remote]
 * @returns {string|null}
 */
export function parseRemoteUrl(configText, remote = 'origin') {
    let inSection = false;
    for (const raw of configText.split('\n')) {
        const line = raw.trim();
        const section = /^\[\s*remote\s+"([^"]+)"\s*\]$/.exec(line);
        if (section) {
            inSection = section[1] === remote;
            continue;
        }
        if (line.startsWith('['))
            inSection = false;
        const url = inSection && /^url\s*=\s*(.+)$/.exec(line);
        if (url)
            return url[1].trim();
    }
    return null;
}

/**
 * "git@github.com:me/repo.git" -> {host: "github.com", web: "https://github.com/me/repo"}
 *
 * @param {string} url
 * @returns {{host: string, web: string}|null}
 */
export function remoteToWeb(url) {
    let host, path;
    let m = /^(?:[^@\s/]+@)?([^:/\s]+):(?!\/)(.+)$/.exec(url); // scp-like: git@host:owner/repo
    if (m && !/^[a-z]+:\/\//i.test(url)) {
        [, host, path] = m;
    } else {
        m = /^(?:https?|ssh|git):\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/i.exec(url);
        if (!m)
            return null;
        [, host, path] = m;
    }
    path = path.replace(/\.git\/?$/, '').replace(/\/+$/, '');
    return path ? {host, web: `https://${host}/${path}`} : null;
}

/**
 * "ref: refs/heads/main" -> "main"; a detached HEAD gives null.
 *
 * @param {string} headText
 * @returns {string|null}
 */
export function parseHead(headText) {
    return /^ref:\s*refs\/heads\/(.+)$/.exec(headText.trim())?.[1] ?? null;
}

/**
 * Web URL for a path inside the repo (the repo page for the root).
 *
 * @param {{host: string, web: string}} remote
 * @param {string|null} branch
 * @param {string} relativePath  "" for the repo root
 * @param {boolean} isFolder
 * @returns {string}
 */
export function webUrlFor(remote, branch, relativePath, isFolder) {
    if (!relativePath || !branch)
        return remote.web;
    const rel = relativePath.split('/').map(encodeURIComponent).join('/');
    const b = encodeURIComponent(branch);
    if (remote.host.includes('gitlab'))
        return `${remote.web}/-/${isFolder ? 'tree' : 'blob'}/${b}/${rel}`;
    if (remote.host.includes('bitbucket'))
        return `${remote.web}/src/${b}/${rel}`;
    if (remote.host.includes('github'))
        return `${remote.web}/${isFolder ? 'tree' : 'blob'}/${b}/${rel}`;
    return remote.web;
}

/** @param {string} host */
export function hostLabel(host) {
    if (host.includes('github'))
        return 'GitHub';
    if (host.includes('gitlab'))
        return 'GitLab';
    if (host.includes('bitbucket'))
        return 'Bitbucket';
    return host;
}
