// Developer text tools used by "/" commands. Pure JavaScript (no GNOME
// imports) so every tool is unit-tested with Node. Tools throw an Error
// with a short, user-facing message when the input doesn't fit.

// ── Base64 (UTF-8, standard or URL-safe) ─────────────────────────────

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base64Encode(text, {urlSafe = false} = {}) {
    const bytes = new TextEncoder().encode(text);
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
        const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
        out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
        out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
        out += i + 2 < bytes.length ? B64[n & 63] : '=';
    }
    return urlSafe ? out.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : out;
}

export function base64Decode(text) {
    const clean = text.trim().replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
    if (!/^[A-Za-z0-9+/]*$/.test(clean) || clean.length % 4 === 1)
        throw new Error('Not valid Base64');
    const bytes = [];
    for (let i = 0; i < clean.length; i += 4) {
        const chunk = clean.slice(i, i + 4);
        const n = [...chunk].reduce((acc, ch, j) => acc | (B64.indexOf(ch) << (18 - 6 * j)), 0);
        bytes.push((n >> 16) & 255);
        if (chunk.length > 2)
            bytes.push((n >> 8) & 255);
        if (chunk.length > 3)
            bytes.push(n & 255);
    }
    try {
        return new TextDecoder('utf-8', {fatal: true}).decode(new Uint8Array(bytes));
    } catch {
        throw new Error('Decoded Base64 is binary, not text');
    }
}

// ── JSON ─────────────────────────────────────────────────────────────

export function formatJson(text) {
    return JSON.stringify(parseJson(text), null, 2);
}

export function minifyJson(text) {
    return JSON.stringify(parseJson(text));
}

function parseJson(text) {
    try {
        return JSON.parse(text);
    } catch (e) {
        throw new Error(`Invalid JSON: ${e.message.replace(/^JSON\.parse: /, '')}`);
    }
}

// ── JWT ──────────────────────────────────────────────────────────────

/**
 * @param {string} token
 * @param {number} nowMs
 * @returns {{header: object, payload: object, summary: string}}
 */
export function decodeJwt(token, nowMs) {
    const parts = token.trim().split('.');
    if (parts.length !== 3)
        throw new Error('Not a JWT (expected three dot-separated parts)');
    let header, payload;
    try {
        header = JSON.parse(base64Decode(parts[0]));
        payload = JSON.parse(base64Decode(parts[1]));
    } catch {
        throw new Error('Not a JWT (header or payload is not Base64 JSON)');
    }

    const bits = [header.alg ?? 'unknown algorithm'];
    if (payload.sub)
        bits.push(`sub ${payload.sub}`);
    if (typeof payload.exp === 'number') {
        const diff = payload.exp * 1000 - nowMs;
        bits.push(diff >= 0 ? `expires ${relativeTime(diff)}` : `expired ${relativeTime(diff)}`);
    }
    return {header, payload, summary: bits.join(' · ')};
}

// ── URL ──────────────────────────────────────────────────────────────

export function urlEncode(text) {
    return encodeURIComponent(text);
}

export function urlDecode(text) {
    try {
        return decodeURIComponent(text.replace(/\+/g, ' '));
    } catch {
        throw new Error('Not valid URL encoding');
    }
}

// ── Time ─────────────────────────────────────────────────────────────

/**
 * Converts between Unix timestamps and dates:
 *   "1700000000" or "1700000000000" -> ISO date, local time, relative
 *   "2026-09-27T10:00:00Z"         -> Unix seconds
 *
 * @param {string} text
 * @param {number} nowMs
 * @returns {{output: string, detail: string}}
 */
export function convertTimestamp(text, nowMs) {
    const t = text.trim();
    if (/^-?\d{9,13}$/.test(t)) {
        const ms = t.replace('-', '').length >= 12 ? Number(t) : Number(t) * 1000;
        const date = new Date(ms);
        return {
            output: date.toISOString(),
            detail: `${date.toLocaleString()} · ${relativeTime(ms - nowMs)}`,
        };
    }
    const ms = Date.parse(t);
    if (Number.isNaN(ms))
        throw new Error('Not a timestamp or date');
    return {output: String(Math.floor(ms / 1000)), detail: `${new Date(ms).toISOString()} · ${relativeTime(ms - nowMs)}`};
}

/**
 * "in 2 hours", "3 days ago", "just now"
 *
 * @param {number} diffMs  positive = future
 * @returns {string}
 */
export function relativeTime(diffMs) {
    const abs = Math.abs(diffMs);
    const units = [['year', 31536e6], ['month', 2592e6], ['day', 864e5], ['hour', 36e5], ['minute', 6e4]];
    for (const [name, size] of units) {
        if (abs >= size) {
            const n = Math.floor(abs / size);
            const label = `${n} ${name}${n === 1 ? '' : 's'}`;
            return diffMs >= 0 ? `in ${label}` : `${label} ago`;
        }
    }
    return 'just now';
}

// ── Case ─────────────────────────────────────────────────────────────

// "helloWorld", "hello_world", "Hello World", "hello-world" -> ["hello", "world"]
function words(text) {
    return text.trim()
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .split(/[\s_\-./]+/)
        .filter(Boolean)
        .map(w => w.toLowerCase());
}

const capitalize = w => w.charAt(0).toUpperCase() + w.slice(1);

export const CASES = {
    camel: t => words(t).map((w, i) => (i === 0 ? w : capitalize(w))).join(''),
    pascal: t => words(t).map(capitalize).join(''),
    snake: t => words(t).join('_'),
    constant: t => words(t).join('_').toUpperCase(),
    kebab: t => words(t).join('-'),
    title: t => words(t).map(capitalize).join(' '),
    upper: t => t.toUpperCase(),
    lower: t => t.toLowerCase(),
};

// ── Generators (random bytes come from the caller) ───────────────────

/**
 * RFC 4122 version-4 UUID from 16 random bytes.
 *
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function uuidV4(bytes) {
    const b = Uint8Array.from(bytes.slice(0, 16));
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant 10
    const hex = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const PASSWORD_ALPHABET =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+';

/**
 * A password from random bytes, without modulo bias (bytes that would bias
 * the result are skipped, so pass more bytes than `length`).
 *
 * @param {Uint8Array} bytes
 * @param {number} length
 * @returns {string}
 */
export function password(bytes, length, alphabet = PASSWORD_ALPHABET) {
    const limit = 256 - (256 % alphabet.length);
    let out = '';
    for (const byte of bytes) {
        if (out.length === length)
            break;
        if (byte < limit)
            out += alphabet[byte % alphabet.length];
    }
    if (out.length < length)
        throw new Error('Not enough random bytes');
    return out;
}

// ── Info ─────────────────────────────────────────────────────────────

export function countText(text) {
    const chars = [...text].length;
    const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
    const lines = text ? text.split('\n').length : 0;
    return `${chars} characters · ${wordCount} words · ${lines} lines`;
}
