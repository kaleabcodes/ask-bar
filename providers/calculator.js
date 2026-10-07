// Inline calculator: "2340 * 1.15" (or "= ...") shows the answer as the top
// result; Enter copies it. Also converts units ("10 km in mi"), number
// bases ("255 to hex") and currencies ("$20 in eur", with online rates).

import GLib from 'gi://GLib';
import St from 'gi://St';

import {evaluate, formatNumber, looksLikeMath} from '../core/calc.js';
import {
    convertCurrency, currencyName, currencySymbol, formatBase, formatMoney, formatQuantity, parseConversion,
} from '../core/convert.js';
import {fetchJson, isCancelled, readFile, writeFile} from '../lib/async.js';

const TOP_SCORE = 1000;
const ICON_SIZE = 32;

// Free, keyless, daily rates for ~160 currencies; attribution is requested.
const RATES_URL = 'https://open.er-api.com/v6/latest/USD';
const RATES_CREDIT = 'Rates by exchangerate-api.com';
const RATES_CACHE = GLib.build_filenamev([GLib.get_user_cache_dir(), 'ask-bar', 'rates.json']);
const RATES_MAX_AGE_MS = 12 * 60 * 60 * 1000;

const BASE_NAMES = {16: 'hexadecimal', 2: 'binary', 8: 'octal', 10: 'decimal'};

export class CalculatorProvider {
    /** @param {Gio.Settings} settings */
    constructor(settings) {
        this._settings = settings;
        this._rates = null;     // {rates: {USD: 1, EUR: …}, fetched: ms}
        this._loading = null;   // in-flight rates Promise
    }

    /**
     * @param {string} query
     * @param {{forced?: boolean, cancellable?: Gio.Cancellable}} options  forced when the "=" prefix was used
     * @returns {import('./types.js').Result[] | Promise<import('./types.js').Result[]>}
     *     a Promise only for currency conversions that still need rates
     */
    search(query, {forced = false, cancellable = null} = {}) {
        if (!query)
            return [];

        const conversion = parseConversion(query);
        if (conversion)
            return this._convert(conversion, forced, cancellable);

        if (!forced && !looksLikeMath(query))
            return [];
        let answer;
        try {
            answer = formatNumber(evaluate(query));
        } catch (e) {
            return forced ? [error('Not a valid expression', e.message)] : [];
        }
        return [result(`= ${answer}`, query, answer)];
    }

    _convert(conversion, forced, cancellable) {
        switch (conversion.kind) {
        case 'error':
            return [error("Can't convert", conversion.message)];
        case 'base': {
            const text = formatBase(conversion.value, conversion.base);
            return [result(`= ${text}`, `${formatNumber(conversion.value)} → ${BASE_NAMES[conversion.base]}`, text)];
        }
        case 'unit': {
            const text = formatQuantity(conversion.result);
            return [result(`= ${text} ${conversion.to.symbol}`,
                `${formatQuantity(conversion.value)} ${conversion.from.symbol}`, text)];
        }
        case 'currency':
            return this._currency(conversion, forced, cancellable);
        }
        return [];
    }

    _currency(conversion, forced, cancellable) {
        if (!this._settings.get_boolean('search-currency'))
            return forced ? [error('Currency conversion is off', 'Turn it on in Ask Bar Settings → Search')] : [];
        if (this._rates && Date.now() - this._rates.fetched < RATES_MAX_AGE_MS)
            return [this._currencyResult(conversion, this._rates)];
        return this._loadRates(cancellable).then(
            rates => [this._currencyResult(conversion, rates)],
            e => {
                if (isCancelled(e))
                    throw e;
                return [error('Exchange rates unavailable', e.message)];
            });
    }

    _currencyResult({value, fromCode, toCode}, {rates, fetched}) {
        let amount;
        try {
            amount = convertCurrency(value, fromCode, toCode, rates);
        } catch (e) {
            return error("Can't convert", e.message);
        }
        const text = formatMoney(amount);
        const age = Math.round((Date.now() - fetched) / 3600000);
        const updated = age < 1 ? 'updated just now' : `updated ${age} h ago`;
        return result(`= ${currencySymbol(toCode)}${text} ${toCode}`,
            `${formatMoney(value)} ${fromCode} → ${currencyName(toCode)}  ·  ${RATES_CREDIT}, ${updated}`,
            text.replace(/,/g, ''));
    }

    // Disk cache first (12 h), then the network. One request at a time.
    _loadRates(cancellable) {
        if (!this._loading) {
            this._loading = this._fetchRates(cancellable).finally(() => {
                this._loading = null;
            });
        }
        return this._loading;
    }

    async _fetchRates(cancellable) {
        const cached = await readFile(RATES_CACHE, cancellable);
        if (cached) {
            try {
                const data = JSON.parse(cached);
                if (data?.rates && Date.now() - data.fetched < RATES_MAX_AGE_MS)
                    return (this._rates = data);
            } catch {}
        }
        const json = await fetchJson(RATES_URL, cancellable);
        if (json?.result !== 'success' || !json.rates)
            throw new Error('Unexpected response from the exchange rate service');
        this._rates = {rates: json.rates, fetched: Date.now()};
        writeFile(RATES_CACHE, JSON.stringify(this._rates))
            .catch(e => console.warn(`[ask-bar] rates cache: ${e.message}`));
        return this._rates;
    }

    destroy() {
        this._rates = null;
    }
}

function result(title, detail, copyText) {
    return {
        id: 'calc:result',
        title,
        subtitle: `${detail}  ·  Enter to copy`,
        kind: 'Calculator',
        score: TOP_SCORE,
        createIcon: icon,
        activate: () => St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, copyText),
    };
}

function error(title, message) {
    return {
        id: 'calc:error',
        title,
        subtitle: message,
        kind: 'Calculator',
        score: TOP_SCORE,
        createIcon: icon,
        activate: null,
    };
}

function icon() {
    return new St.Icon({icon_name: 'accessories-calculator-symbolic', icon_size: ICON_SIZE});
}
