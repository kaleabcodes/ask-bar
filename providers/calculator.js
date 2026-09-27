// Inline calculator: "2340 * 1.15" (or "= ...") shows the answer as the top
// result; Enter copies it.

import St from 'gi://St';

import {evaluate, formatNumber, looksLikeMath} from '../core/calc.js';

const TOP_SCORE = 1000;
const ICON_SIZE = 32;

export class CalculatorProvider {
    /**
     * @param {string} query
     * @param {{forced: boolean}} options  forced when the "=" prefix was used
     * @returns {import('./types.js').Result[]}
     */
    search(query, {forced = false} = {}) {
        if (!query || (!forced && !looksLikeMath(query)))
            return [];

        let answer;
        try {
            answer = formatNumber(evaluate(query));
        } catch (e) {
            if (!forced)
                return [];
            return [{
                id: 'calc:error',
                title: 'Not a valid expression',
                subtitle: e.message,
                kind: 'Calculator',
                score: TOP_SCORE,
                createIcon: () => new St.Icon({icon_name: 'accessories-calculator-symbolic', icon_size: ICON_SIZE}),
                activate: null,
            }];
        }

        return [{
            id: 'calc:result',
            title: `= ${answer}`,
            subtitle: `${query}  ·  Enter to copy`,
            kind: 'Calculator',
            score: TOP_SCORE,
            createIcon: () => new St.Icon({icon_name: 'accessories-calculator-symbolic', icon_size: ICON_SIZE}),
            activate: () => St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, answer),
        }];
    }

    destroy() {}
}
