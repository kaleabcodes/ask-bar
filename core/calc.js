// A small, safe calculator: a recursive-descent parser, never eval().
// Pure JavaScript, unit-tested with Node.
//
// Supports + - * / % ^ (power), parentheses, unary minus, "×" and "÷",
// constants pi and e, and the functions below.

const FUNCTIONS = {
    sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs,
    round: Math.round, floor: Math.floor, ceil: Math.ceil,
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    asin: Math.asin, acos: Math.acos, atan: Math.atan,
    log: Math.log10, ln: Math.log, log2: Math.log2, exp: Math.exp,
    min: Math.min, max: Math.max,
};

const CONSTANTS = {pi: Math.PI, e: Math.E};

const OPERATOR = /[+\-*/%^×÷]/;

/**
 * Whether the text is worth evaluating as math without an "=" prefix:
 * it must contain an operator or a function call, and at least one digit.
 * Plain numbers ("2024") and words ("e") aren't treated as math.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function looksLikeMath(text) {
    const t = text.trim();
    if (!/\d/.test(t) || !/^[\d\s.+\-*/%^()×÷,a-z]+$/i.test(t))
        return false;
    const hasFunction = Object.keys(FUNCTIONS).some(f => new RegExp(`\\b${f}\\s*\\(`, 'i').test(t));
    const hasOperator = OPERATOR.test(t.replace(/^[-+]/, ''));
    if (!hasFunction && !hasOperator)
        return false;
    try {
        evaluate(t);
        return true;
    } catch {
        return false;
    }
}

/**
 * @param {string} expression
 * @returns {number}
 * @throws {Error} on invalid input
 */
export function evaluate(expression) {
    const tokens = tokenize(expression);
    let pos = 0;

    const peek = () => tokens[pos];
    const next = () => tokens[pos++];
    const expect = value => {
        if (next() !== value)
            throw new Error(`Expected "${value}"`);
    };

    // expression := term (("+" | "-") term)*
    function parseExpression() {
        let value = parseTerm();
        while (peek() === '+' || peek() === '-')
            value = next() === '+' ? value + parseTerm() : value - parseTerm();
        return value;
    }

    // term := unary (("*" | "/" | "%") unary)*
    function parseTerm() {
        let value = parseUnary();
        while (peek() === '*' || peek() === '/' || peek() === '%') {
            const op = next();
            const rhs = parseUnary();
            if ((op === '/' || op === '%') && rhs === 0)
                throw new Error('Division by zero');
            value = op === '*' ? value * rhs : op === '/' ? value / rhs : value % rhs;
        }
        return value;
    }

    // unary := ("-" | "+") unary | power
    function parseUnary() {
        if (peek() === '-') {
            next();
            return -parseUnary();
        }
        if (peek() === '+') {
            next();
            return parseUnary();
        }
        return parsePower();
    }

    // power := primary ("^" unary)?   (right-associative: 2^3^2 = 2^9)
    function parsePower() {
        const base = parsePrimary();
        if (peek() === '^') {
            next();
            return base ** parseUnary();
        }
        return base;
    }

    // primary := number | constant | function "(" args ")" | "(" expression ")"
    function parsePrimary() {
        const token = next();
        if (token === undefined)
            throw new Error('Unexpected end of expression');
        if (typeof token === 'number')
            return token;
        if (token === '(') {
            const value = parseExpression();
            expect(')');
            return value;
        }
        if (token in CONSTANTS)
            return CONSTANTS[token];
        if (token in FUNCTIONS) {
            expect('(');
            const args = [parseExpression()];
            while (peek() === ',') {
                next();
                args.push(parseExpression());
            }
            expect(')');
            return FUNCTIONS[token](...args);
        }
        throw new Error(`Unexpected "${token}"`);
    }

    const result = parseExpression();
    if (pos < tokens.length)
        throw new Error(`Unexpected "${tokens[pos]}"`);
    if (!Number.isFinite(result))
        throw new Error('Result is not a finite number');
    return result;
}

/**
 * Formats a result for display and copying: at most 12 significant digits,
 * no floating-point noise (0.1 + 0.2 -> "0.3").
 *
 * @param {number} value
 * @returns {string}
 */
export function formatNumber(value) {
    if (Number.isInteger(value) && Math.abs(value) < 1e15)
        return String(value);
    return String(Number.parseFloat(value.toPrecision(12)));
}

function tokenize(expression) {
    const tokens = [];
    const src = expression.replace(/×/g, '*').replace(/÷/g, '/').toLowerCase();
    let i = 0;
    while (i < src.length) {
        const ch = src[i];
        if (/\s/.test(ch)) {
            i++;
        } else if (/[\d.]/.test(ch)) {
            const match = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/.exec(src.slice(i));
            if (!match)
                throw new Error(`Invalid number at "${src.slice(i)}"`);
            tokens.push(Number.parseFloat(match[0]));
            i += match[0].length;
        } else if (/[a-z]/.test(ch)) {
            const match = /^[a-z][a-z0-9]*/.exec(src.slice(i));
            tokens.push(match[0]);
            i += match[0].length;
        } else if ('+-*/%^(),'.includes(ch)) {
            tokens.push(ch);
            i++;
        } else {
            throw new Error(`Unexpected "${ch}"`);
        }
    }
    return tokens;
}
