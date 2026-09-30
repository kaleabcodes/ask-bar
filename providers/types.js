// Shared shape of a search result. Documentation only; not imported at runtime.

/**
 * @typedef {object} Result
 * @property {string} id          stable id, used to keep the selection across updates
 * @property {string} title
 * @property {string} subtitle
 * @property {string} kind        right-hand label, e.g. "Application"
 * @property {number} score       higher is listed first
 * @property {() => import('gi://Clutter').default.Actor} createIcon
 * @property {(() => void)|null} activate   null for rows that only show information
 * @property {() => void} [altActivate]      Ctrl+Enter action, if any
 * @property {string} [altLabel]             footer hint for altActivate, e.g. "Show in Files"
 * @property {() => Result[]} [actions]     Alt+Enter action list (open in editor, …)
 * @property {string} [fill]                 Enter/Tab puts this text in the bar instead
 *                                           of closing (e.g. "!gh ")
 * @property {{id: string, title: string, isFolder?: boolean, isProject?: boolean}} [favorite]
 *                                           stable reference saved when pinned
 * @property {boolean} [keepOpen]             run an action, then refresh without closing
 */

export {};
