// A small, safe calculator: a recursive-descent parser, never eval().
// Pure JavaScript, unit-tested with Node.
//
// Supports + - * / % ^ (power), parentheses, unary minus, "×" and "÷",
// constants pi and e, and the functions below. Also percentages ("20% of
// 80", "80 + 20%", "15%" of the left operand) and hexadecimal, binary and
// octal literals ("0xff + 1", "0b1010"). A "%" followed by a value is
// still the modulo operator ("10 % 4").

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
const BASE_LITERAL = /\b0[xbo][0-9a-f]+\b/i;

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
    const hasOperator = OPERATOR.test(t.replace(/^[-+]/, '')) || /\bof\b/.test(t);
    if (!hasFunction && !hasOperator && !BASE_LITERAL.test(t))
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

    // A "%" is modulo when a value follows it ("10 % 4"); otherwise it is
    // a percent sign ("20%", "20% of 80", "80 + 20%").
    const isModulo = at => {
        const after = tokens[at + 1];
        return typeof after === 'number' || after === '(' ||
            (typeof after === 'string' && /^[a-z]/.test(after) && after !== 'of');
    };

    // expression := term (("+" | "-") term)*
    // "80 + 20%" adds 20% of 80; "80 - 20%" subtracts it.
    function parseExpression() {
        let value = parseTerm();
        while (peek() === '+' || peek() === '-') {
            const op = next();
            const start = pos;
            const rhs = parseTerm();
            const relative = tokens[pos - 1] === '%' && pos - start === 2 && typeof tokens[start] === 'number';
            const amount = relative ? value * rhs : rhs;
            value = op === '+' ? value + amount : value - amount;
        }
        return value;
    }

    // term := unary (("*" | "/" | "%" | "of") unary)*
    function parseTerm() {
        let value = parseUnary();
        for (;;) {
            const op = peek();
            if (op === '%' && !isModulo(pos))
                break;
            if (op !== '*' && op !== '/' && op !== '%' && op !== 'of')
                break;
            next();
            const rhs = parseUnary();
            if ((op === '/' || op === '%') && rhs === 0)
                throw new Error('Division by zero');
            value = op === '*' || op === 'of' ? value * rhs : op === '/' ? value / rhs : value % rhs;
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

    // power := percent ("^" unary)?   (right-associative: 2^3^2 = 2^9)
    function parsePower() {
        const base = parsePercent();
        if (peek() === '^') {
            next();
            return base ** parseUnary();
        }
        return base;
    }

    // percent := primary "%"*   (a trailing percent sign divides by 100)
    function parsePercent() {
        let value = parsePrimary();
        while (peek() === '%' && !isModulo(pos)) {
            next();
            value /= 100;
        }
        return value;
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
            const literal = /^0([xbo])([0-9a-f]+)/.exec(src.slice(i));
            if (literal) {
                const radix = {x: 16, b: 2, o: 8}[literal[1]];
                const value = Number.parseInt(literal[2], radix);
                if (Number.isNaN(value) || literal[2] !== value.toString(radix).padStart(literal[2].length, '0'))
                    throw new Error(`Invalid number "${literal[0]}"`);
                tokens.push(value);
                i += literal[0].length;
                continue;
            }
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
