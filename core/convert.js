// Conversions typed into the bar: units ("10 km in mi", "100 f to c"),
// currencies ("$20 in eur", "20 usd to etb") and number bases ("255 to
// hex", "0xff to bin"). Pure JavaScript, unit-tested with Node.
//
// Currency rates come from the provider (fetched online); this module only
// parses the request and does the arithmetic.

import {evaluate} from './calc.js';

// "<amount> [unit] (to|in|as|->) <unit>", split at the last separator so
// "10 in to cm" keeps "in" as inches.
const SEPARATOR = /\s+(?:to|in|as|->|→)(?=\s)/gi;
const CURRENCY_SYMBOL = /^([$€£¥₹₩₺₽₪฿₫₦₱])\s*(.+)$/u;
const TRAILING_UNIT = /^(.*?[\d)])\s*((?:(?:square|sq|cubic)\s+)?[a-zµ°][a-z0-9°²³/]*)$/iu;

export const BASES = {
    hex: 16, hexadecimal: 16, bin: 2, binary: 2, oct: 8, octal: 8, dec: 10, decimal: 10,
};

/**
 * @typedef {object} Unit
 * @property {string} category
 * @property {string} symbol      shown in the result
 * @property {number} [factor]    to the category's base unit
 * @property {(v: number) => number} [toBase]    for temperatures
 * @property {(v: number) => number} [fromBase]
 */

const unit = (category, symbol, factor, aliases) => ({category, symbol, factor, aliases: [symbol, ...aliases]});

export const UNITS = [
    // length (metre)
    unit('length', 'mm', 0.001, ['millimeter', 'millimeters', 'millimetre', 'millimetres']),
    unit('length', 'cm', 0.01, ['centimeter', 'centimeters', 'centimetre', 'centimetres']),
    unit('length', 'm', 1, ['meter', 'meters', 'metre', 'metres']),
    unit('length', 'km', 1000, ['kilometer', 'kilometers', 'kilometre', 'kilometres']),
    unit('length', 'µm', 1e-6, ['um', 'micrometer', 'micrometers', 'micron', 'microns']),
    unit('length', 'nm', 1e-9, ['nanometer', 'nanometers']),
    unit('length', 'in', 0.0254, ['inch', 'inches', '"']),
    unit('length', 'ft', 0.3048, ['foot', 'feet']),
    unit('length', 'yd', 0.9144, ['yard', 'yards']),
    unit('length', 'mi', 1609.344, ['mile', 'miles']),
    unit('length', 'nmi', 1852, ['nauticalmile', 'nauticalmiles']),
    // mass (kilogram)
    unit('mass', 'mg', 1e-6, ['milligram', 'milligrams']),
    unit('mass', 'g', 0.001, ['gram', 'grams', 'gramme', 'grammes']),
    unit('mass', 'kg', 1, ['kilogram', 'kilograms', 'kilo', 'kilos']),
    unit('mass', 't', 1000, ['tonne', 'tonnes', 'ton', 'tons']),
    unit('mass', 'oz', 0.028349523125, ['ounce', 'ounces']),
    unit('mass', 'lb', 0.45359237, ['lbs', 'pound', 'pounds']),
    unit('mass', 'st', 6.35029318, ['stone', 'stones']),
    // temperature
    {category: 'temperature', symbol: '°C', aliases: ['c', '°c', 'celsius', 'centigrade', 'degc'],
        toBase: v => v + 273.15, fromBase: v => v - 273.15},
    {category: 'temperature', symbol: '°F', aliases: ['f', '°f', 'fahrenheit', 'degf'],
        toBase: v => (v - 32) * 5 / 9 + 273.15, fromBase: v => (v - 273.15) * 9 / 5 + 32},
    {category: 'temperature', symbol: 'K', aliases: ['k', 'kelvin'], toBase: v => v, fromBase: v => v},
    // volume (litre)
    unit('volume', 'ml', 0.001, ['milliliter', 'milliliters', 'millilitre', 'millilitres', 'cc']),
    unit('volume', 'cl', 0.01, ['centiliter', 'centilitre']),
    unit('volume', 'dl', 0.1, ['deciliter', 'decilitre']),
    unit('volume', 'l', 1, ['liter', 'liters', 'litre', 'litres']),
    unit('volume', 'm³', 1000, ['m3', 'meter3', 'meters3', 'metre3', 'metres3']),
    unit('volume', 'gal', 3.785411784, ['gallon', 'gallons']),
    unit('volume', 'qt', 0.946352946, ['quart', 'quarts']),
    unit('volume', 'pt', 0.473176473, ['pint', 'pints']),
    unit('volume', 'cup', 0.2365882365, ['cups']),
    unit('volume', 'fl oz', 0.0295735295625, ['floz', 'fluidounce', 'fluidounces']),
    unit('volume', 'tbsp', 0.01478676478125, ['tablespoon', 'tablespoons']),
    unit('volume', 'tsp', 0.00492892159375, ['teaspoon', 'teaspoons']),
    // area (square metre)
    unit('area', 'mm²', 1e-6, ['mm2']),
    unit('area', 'cm²', 1e-4, ['cm2']),
    unit('area', 'm²', 1, ['m2', 'meter2', 'meters2', 'metre2', 'metres2']),
    unit('area', 'km²', 1e6, ['km2']),
    unit('area', 'ha', 1e4, ['hectare', 'hectares']),
    unit('area', 'acre', 4046.8564224, ['acres', 'ac']),
    unit('area', 'ft²', 0.09290304, ['ft2', 'foot2', 'feet2']),
    unit('area', 'in²', 0.00064516, ['in2', 'inch2', 'inches2']),
    unit('area', 'mi²', 2589988.110336, ['mi2', 'mile2', 'miles2']),
    // speed (metre per second)
    unit('speed', 'm/s', 1, ['mps']),
    unit('speed', 'km/h', 1 / 3.6, ['kmh', 'kph']),
    unit('speed', 'mph', 0.44704, ['mi/h']),
    unit('speed', 'kn', 0.514444444, ['knot', 'knots']),
    unit('speed', 'ft/s', 0.3048, ['fps']),
    // time (second)
    unit('time', 'ms', 0.001, ['millisecond', 'milliseconds']),
    unit('time', 's', 1, ['sec', 'secs', 'second', 'seconds']),
    unit('time', 'min', 60, ['mins', 'minute', 'minutes']),
    unit('time', 'h', 3600, ['hr', 'hrs', 'hour', 'hours']),
    unit('time', 'd', 86400, ['day', 'days']),
    unit('time', 'wk', 604800, ['week', 'weeks']),
    unit('time', 'mo', 2629800, ['month', 'months']),
    unit('time', 'yr', 31557600, ['year', 'years']),
    // data (byte)
    unit('data', 'bit', 1 / 8, ['bits']),
    unit('data', 'B', 1, ['byte', 'bytes']),
    unit('data', 'kB', 1e3, ['kilobyte', 'kilobytes']),
    unit('data', 'MB', 1e6, ['megabyte', 'megabytes']),
    unit('data', 'GB', 1e9, ['gigabyte', 'gigabytes']),
    unit('data', 'TB', 1e12, ['terabyte', 'terabytes']),
    unit('data', 'PB', 1e15, ['petabyte', 'petabytes']),
    unit('data', 'KiB', 1024, ['kibibyte']),
    unit('data', 'MiB', 1024 ** 2, ['mebibyte']),
    unit('data', 'GiB', 1024 ** 3, ['gibibyte']),
    unit('data', 'TiB', 1024 ** 4, ['tebibyte']),
    unit('data', 'kbit', 1e3 / 8, ['kilobit', 'kilobits']),
    unit('data', 'Mbit', 1e6 / 8, ['megabit', 'megabits']),
    unit('data', 'Gbit', 1e9 / 8, ['gigabit', 'gigabits']),
    // angle (radian)
    unit('angle', 'rad', 1, ['radian', 'radians']),
    unit('angle', '°', Math.PI / 180, ['deg', 'degree', 'degrees']),
    unit('angle', 'turn', 2 * Math.PI, ['turns', 'rev']),
    // energy (joule)
    unit('energy', 'J', 1, ['joule', 'joules']),
    unit('energy', 'kJ', 1e3, ['kilojoule', 'kilojoules']),
    unit('energy', 'cal', 4.184, ['calorie', 'calories']),
    unit('energy', 'kcal', 4184, ['kilocalorie', 'kilocalories']),
    unit('energy', 'Wh', 3600, []),
    unit('energy', 'kWh', 3.6e6, []),
    unit('energy', 'eV', 1.602176634e-19, []),
    unit('energy', 'BTU', 1055.05585262, []),
    // power (watt)
    unit('power', 'W', 1, ['watt', 'watts']),
    unit('power', 'kW', 1e3, ['kilowatt', 'kilowatts']),
    unit('power', 'hp', 745.69987158, ['horsepower']),
    // pressure (pascal)
    unit('pressure', 'Pa', 1, ['pascal']),
    unit('pressure', 'kPa', 1e3, []),
    unit('pressure', 'bar', 1e5, ['bars']),
    unit('pressure', 'psi', 6894.757293168, []),
    unit('pressure', 'atm', 101325, ['atmosphere', 'atmospheres']),
    unit('pressure', 'mmHg', 133.322387415, ['torr']),
];

// Currency code -> [symbol, name]. Symbols and names are accepted when they
// are unambiguous ("$" is the US dollar, "pound" is also a unit of mass).
export const CURRENCIES = {
    USD: ['$', 'US Dollar', ['dollar', 'dollars', 'usd', 'bucks']],
    EUR: ['€', 'Euro', ['euro', 'euros']],
    GBP: ['£', 'British Pound', ['pound', 'pounds', 'quid', 'sterling']],
    JPY: ['¥', 'Japanese Yen', ['yen']],
    CNY: ['CN¥', 'Chinese Yuan', ['yuan', 'rmb', 'renminbi']],
    INR: ['₹', 'Indian Rupee', ['rupee', 'rupees']],
    ETB: ['Br', 'Ethiopian Birr', ['birr']],
    CAD: ['CA$', 'Canadian Dollar', []],
    AUD: ['A$', 'Australian Dollar', []],
    CHF: ['CHF', 'Swiss Franc', ['franc', 'francs']],
    SEK: ['kr', 'Swedish Krona', ['krona', 'kronor']],
    NOK: ['kr', 'Norwegian Krone', ['krone', 'kroner']],
    DKK: ['kr', 'Danish Krone', []],
    PLN: ['zł', 'Polish Złoty', ['zloty', 'złoty']],
    CZK: ['Kč', 'Czech Koruna', ['koruna']],
    HUF: ['Ft', 'Hungarian Forint', ['forint']],
    RUB: ['₽', 'Russian Ruble', ['ruble', 'rubles', 'rouble']],
    TRY: ['₺', 'Turkish Lira', ['lira']],
    BRL: ['R$', 'Brazilian Real', ['real', 'reais']],
    MXN: ['MX$', 'Mexican Peso', ['peso', 'pesos']],
    ZAR: ['R', 'South African Rand', ['rand']],
    KRW: ['₩', 'South Korean Won', ['won']],
    SGD: ['S$', 'Singapore Dollar', []],
    HKD: ['HK$', 'Hong Kong Dollar', []],
    NZD: ['NZ$', 'New Zealand Dollar', []],
    AED: ['AED', 'UAE Dirham', ['dirham', 'dirhams']],
    SAR: ['SAR', 'Saudi Riyal', ['riyal', 'riyals']],
    QAR: ['QAR', 'Qatari Riyal', []],
    KWD: ['KWD', 'Kuwaiti Dinar', ['dinar']],
    EGP: ['E£', 'Egyptian Pound', []],
    NGN: ['₦', 'Nigerian Naira', ['naira']],
    KES: ['KSh', 'Kenyan Shilling', []],
    GHS: ['GH₵', 'Ghanaian Cedi', ['cedi', 'cedis']],
    TZS: ['TSh', 'Tanzanian Shilling', []],
    UGX: ['USh', 'Ugandan Shilling', []],
    MAD: ['MAD', 'Moroccan Dirham', []],
    ILS: ['₪', 'Israeli Shekel', ['shekel', 'shekels']],
    THB: ['฿', 'Thai Baht', ['baht']],
    IDR: ['Rp', 'Indonesian Rupiah', ['rupiah']],
    MYR: ['RM', 'Malaysian Ringgit', ['ringgit']],
    PHP: ['₱', 'Philippine Peso', []],
    VND: ['₫', 'Vietnamese Dong', ['dong']],
    PKR: ['PKR', 'Pakistani Rupee', []],
    BDT: ['৳', 'Bangladeshi Taka', ['taka']],
    ARS: ['ARS', 'Argentine Peso', []],
    CLP: ['CLP', 'Chilean Peso', []],
    COP: ['COP', 'Colombian Peso', []],
    TWD: ['NT$', 'New Taiwan Dollar', []],
    UAH: ['₴', 'Ukrainian Hryvnia', ['hryvnia']],
    RON: ['lei', 'Romanian Leu', ['leu']],
    BGN: ['лв', 'Bulgarian Lev', ['lev', 'leva']],
};

// Symbols that stand for exactly one currency.
const CURRENCY_SYMBOLS = {
    '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR', '₩': 'KRW', '₺': 'TRY',
    '₽': 'RUB', '₪': 'ILS', '฿': 'THB', '₫': 'VND', '₦': 'NGN', '₱': 'PHP',
};

/**
 * @typedef {object} Conversion
 * @property {'unit'|'currency'|'base'|'error'} kind
 * @property {number} [value]        the amount typed (unit, currency) or the number (base)
 * @property {number} [result]       converted value (unit)
 * @property {Unit} [from]           unit conversions
 * @property {Unit} [to]
 * @property {string} [fromCode]     currency conversions, e.g. "USD"
 * @property {string} [toCode]
 * @property {number} [base]         2, 8, 10 or 16
 * @property {string} [message]      kind "error"
 */

/**
 * Recognizes a conversion request. Returns null for anything else, so the
 * caller can fall back to the plain calculator.
 *
 * @param {string} text
 * @returns {Conversion|null}
 */
export function parseConversion(text) {
    const t = text.trim();
    let match;
    let last = null;
    SEPARATOR.lastIndex = 0;
    while ((match = SEPARATOR.exec(t)) !== null)
        last = match;
    if (!last)
        return null;

    const left = t.slice(0, last.index).trim();
    const target = t.slice(last.index + last[0].length).trim();
    if (!left || !target)
        return null;

    // "255 to hex": the whole left side is the number ("0xff" is not 0 + "xff").
    const base = BASES[normalize(target)];
    const {expression, unitText} = base === undefined ? splitAmount(left) : {expression: left, unitText: ''};
    let value;
    try {
        value = evaluate(expression);
    } catch {
        return null;
    }

    if (base !== undefined) {
        if (!Number.isInteger(value))
            return {kind: 'error', message: 'Only whole numbers can be shown in another base'};
        return {kind: 'base', value, base};
    }
    if (!unitText)
        return null;

    const fromOptions = resolve(unitText);
    const toOptions = resolve(target);
    if (fromOptions.length === 0 || toOptions.length === 0)
        return null;

    for (const from of fromOptions) {
        for (const to of toOptions) {
            if (from.kind === 'currency' && to.kind === 'currency')
                return {kind: 'currency', value, fromCode: from.code, toCode: to.code};
            if (from.kind === 'unit' && to.kind === 'unit' && from.unit.category === to.unit.category)
                return {kind: 'unit', value, from: from.unit, to: to.unit, result: convertUnits(value, from.unit, to.unit)};
        }
    }
    const describe = o => (o.kind === 'currency' ? 'a currency' : o.unit.category);
    return {kind: 'error', message: `Can't convert ${describe(fromOptions[0])} to ${describe(toOptions[0])}`};
}

/**
 * @param {number} value
 * @param {Unit} from
 * @param {Unit} to
 * @returns {number}
 */
export function convertUnits(value, from, to) {
    const base = from.toBase ? from.toBase(value) : value * from.factor;
    return to.fromBase ? to.fromBase(base) : base / to.factor;
}

/**
 * @param {number} amount
 * @param {string} from  currency code
 * @param {string} to
 * @param {Record<string, number>} rates  units of each currency per one unit of a common base
 * @returns {number}
 * @throws {Error} when a rate is missing
 */
export function convertCurrency(amount, from, to, rates) {
    if (!rates?.[from] || !rates?.[to])
        throw new Error(`No exchange rate for ${rates?.[from] ? to : from}`);
    return amount / rates[from] * rates[to];
}

/**
 * "0xff", "0b1010", "0o17" or plain decimal; negative numbers keep their sign.
 *
 * @param {number} value  an integer
 * @param {number} base   2, 8, 10 or 16
 * @returns {string}
 */
export function formatBase(value, base) {
    const prefix = {16: '0x', 2: '0b', 8: '0o', 10: ''}[base];
    return `${value < 0 ? '-' : ''}${prefix}${Math.abs(value).toString(base)}`;
}

/**
 * A readable converted quantity: whole numbers as they are, otherwise up
 * to 6 significant digits and at most 4 decimals once above 1 ("6.2137").
 *
 * @param {number} value
 * @returns {string}
 */
export function formatQuantity(value) {
    if (Number.isInteger(value) && Math.abs(value) < 1e15)
        return String(value);
    if (Math.abs(value) >= 1e15 || (Math.abs(value) < 1e-4 && value !== 0))
        return value.toExponential(4).replace(/\.?0+e/, 'e');
    let rounded = Number.parseFloat(value.toPrecision(6));
    if (Math.abs(rounded) >= 1)
        rounded = Math.round(rounded * 1e4) / 1e4;
    return String(rounded);
}

/**
 * Money: two decimals, or more for tiny amounts ("0.000012").
 *
 * @param {number} value
 * @returns {string}
 */
export function formatMoney(value) {
    if (value !== 0 && Math.abs(value) < 0.01)
        return String(Number.parseFloat(value.toPrecision(3)));
    return value.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

/**
 * @param {string} code
 * @returns {string} e.g. "€", or the code itself
 */
export function currencySymbol(code) {
    return CURRENCIES[code]?.[0] ?? code;
}

export function currencyName(code) {
    return CURRENCIES[code]?.[1] ?? code;
}

// ── Internals ────────────────────────────────────────────────────────

// "10 km" -> {expression: "10", unitText: "km"}; "$20" -> {"20", "$"}.
function splitAmount(left) {
    const symbol = CURRENCY_SYMBOL.exec(left);
    if (symbol)
        return {expression: symbol[2], unitText: symbol[1]};
    const trailing = TRAILING_UNIT.exec(left);
    if (trailing)
        return {expression: trailing[1], unitText: trailing[2]};
    return {expression: left, unitText: ''};
}

// Lowercase, no spaces or dots, "square x" / "sq x" -> "x2", "cubic x" -> "x3", "²" -> "2".
function normalize(text) {
    return text.toLowerCase().replace(/\./g, '').replace(/²/g, '2').replace(/³/g, '3')
        .replace(/^(?:square|sq)\s*(.+)$/, '$12').replace(/^cubic\s*(.+)$/, '$13')
        .replace(/\s+/g, '');
}

/**
 * Everything a token may mean: "pound" is a mass unit and a currency.
 *
 * @returns {Array<{kind: 'unit', unit: Unit}|{kind: 'currency', code: string}>}
 */
function resolve(text) {
    const key = normalize(text);
    const options = [];
    for (const u of UNITS) {
        if (u.aliases.some(a => a.toLowerCase() === key))
            options.push({kind: 'unit', unit: u});
    }
    const symbol = CURRENCY_SYMBOLS[text.trim()];
    if (symbol)
        options.push({kind: 'currency', code: symbol});
    const upper = key.toUpperCase();
    if (CURRENCIES[upper])
        options.push({kind: 'currency', code: upper});
    for (const [code, [, , aliases]] of Object.entries(CURRENCIES)) {
        if (aliases.includes(key) && !options.some(o => o.kind === 'currency' && o.code === code))
            options.push({kind: 'currency', code});
    }
    return options;
}
