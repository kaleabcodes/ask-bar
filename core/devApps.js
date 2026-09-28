// Code editors and terminals Ask Bar can open a file or folder in, matched
// by .desktop id. Pure JavaScript, unit-tested with Node.

export const EDITORS = [
    {key: 'code', match: /^(code|code_code|com\.visualstudio\.code|visual-studio-code)\.desktop$/},
    {key: 'cursor', match: /^cursor(_cursor)?\.desktop$/},
    {key: 'zed', match: /^(dev\.zed\.Zed|zed)\.desktop$/},
    {key: 'webstorm', match: /^(jetbrains-webstorm(-[\w-]+)?|webstorm)\.desktop$/},
    {key: 'idea', match: /^jetbrains-idea(-ce)?(-[\w-]+)?\.desktop$/},
    {key: 'pycharm', match: /^jetbrains-pycharm(-ce)?(-[\w-]+)?\.desktop$/},
    {key: 'goland', match: /^jetbrains-goland(-[\w-]+)?\.desktop$/},
    {key: 'clion', match: /^jetbrains-clion(-[\w-]+)?\.desktop$/},
    {key: 'sublime', match: /^sublime_text\.desktop$/},
    {key: 'builder', match: /^org\.gnome\.Builder\.desktop$/},
    {key: 'texteditor', match: /^org\.gnome\.TextEditor\.desktop$/, filesOnly: true},
];

// argv to open a new terminal window in `dir`. `label` tells terminals apart
// (Ptyxis and GNOME Terminal are both called "Terminal").
export const TERMINALS = [
    {key: 'ptyxis', label: 'Ptyxis', match: /^org\.gnome\.Ptyxis\.desktop$/, argv: d => ['ptyxis', '--new-window', '-d', d]},
    {key: 'console', label: 'Console', match: /^org\.gnome\.Console\.desktop$/, argv: d => ['kgx', '--working-directory', d]},
    {key: 'gnome-terminal', label: 'GNOME Terminal', match: /^org\.gnome\.Terminal\.desktop$/, argv: d => ['gnome-terminal', '--working-directory', d]},
    {key: 'ghostty', label: 'Ghostty', match: /^com\.mitchellh\.ghostty\.desktop$/, argv: d => ['ghostty', `--working-directory=${d}`]},
    {key: 'kitty', label: 'kitty', match: /^kitty\.desktop$/, argv: d => ['kitty', '--directory', d]},
    {key: 'alacritty', label: 'Alacritty', match: /^(Alacritty|alacritty|org\.alacritty\.Alacritty)\.desktop$/, argv: d => ['alacritty', '--working-directory', d]},
    {key: 'wezterm', label: 'WezTerm', match: /^org\.wezfurlong\.wezterm\.desktop$/, argv: d => ['wezterm', 'start', '--cwd', d]},
    {key: 'konsole', label: 'Konsole', match: /^org\.kde\.konsole\.desktop$/, argv: d => ['konsole', '--workdir', d]},
];

/**
 * @param {string} desktopId
 * @param {Array<{match: RegExp}>} list
 */
export function matchApp(desktopId, list) {
    return list.find(entry => entry.match.test(desktopId)) ?? null;
}

/**
 * Turns a .desktop Exec line (already split into argv) into a command that
 * opens `path`: file field codes (%f %F %u %U) become the path, other
 * codes are dropped, and the path is appended if there was no file code.
 * Using a plain path (not a file:// URI) works for editors whose Exec takes
 * %u but expect a path, like JetBrains IDEs.
 *
 * @param {string[]} execArgv
 * @param {string} path
 * @returns {string[]}
 */
export function editorArgv(execArgv, path) {
    let placed = false;
    const argv = [];
    for (const arg of execArgv) {
        if (/^%[fFuU]$/.test(arg)) {
            if (!placed)
                argv.push(path);
            placed = true;
        } else if (/^%[a-zA-Z]$/.test(arg)) {
            continue; // %i %c %k …
        } else {
            argv.push(arg.replace(/%%/g, '%'));
        }
    }
    if (!placed)
        argv.push(path);
    return argv;
}
