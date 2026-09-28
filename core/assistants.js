// Desktop AI apps that Ask Bar can hand a question to. Pure JavaScript,
// unit-tested with Node.

/**
 * @typedef {object} Assistant
 * @property {string} key
 * @property {string} name
 * @property {string[]} desktopIds   known .desktop ids (Flatpak, Snap, deb…)
 * @property {RegExp} executable     fallback match on the launched binary
 * @property {(question: string) => string} link  opens the app with the question
 */

/** @type {Assistant[]} */
export const ASSISTANTS = [
    {
        key: 'claude',
        name: 'Claude',
        desktopIds: ['com.anthropic.Claude.desktop', 'claude-desktop.desktop', 'claude.desktop'],
        executable: /(^|\/)claude-desktop$/,
        // The app handles claude:// links; claude.ai prefills ?q= in a new chat.
        link: q => `claude://claude.ai/new?q=${encodeURIComponent(q)}`,
    },
    {
        key: 'chatgpt',
        name: 'ChatGPT',
        desktopIds: ['chatgpt.desktop', 'com.openai.ChatGPT.desktop', 'chatgpt_chatgpt.desktop'],
        executable: /(^|\/)chatgpt(-desktop)?$/i,
        // The app opens chatgpt.com links; ?q= starts a chat with the question.
        link: q => `https://chatgpt.com/?q=${encodeURIComponent(q)}`,
    },
];

/**
 * Which assistant (if any) an installed app is.
 *
 * @param {{id: string, executable: string|null}} app
 * @returns {Assistant|null}
 */
export function matchAssistant({id, executable}) {
    return ASSISTANTS.find(a => a.desktopIds.includes(id) ||
        (executable && a.executable.test(executable.split(/\s+/)[0]))) ?? null;
}
