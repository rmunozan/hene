// hene/compiler/transforms/dom.js
/**
 * @fileoverview Utilities for processing `sync()` expressions.
 * - `extractAndEnrichSyncExpressions`: Parses `sync(STATE_INSTANCE)` calls from strings.
 * - `processTextForRender`: Transforms text containing `sync()` calls for rendering,
 *   replacing `sync(STATE_INSTANCE)` with `STATE_INSTANCE`.
 */
import * as acorn from 'acorn';

/**
 * Extracts and parses `sync(STATE_INSTANCE)` expressions from a string.
 * @param {string} text - The text to scan.
 * @returns {Array<object>} Array of { original, inner, start, end, syncTargetAST }.
 */
export function extractAndEnrichSyncExpressions(text) {
    if (!text || !text.includes('sync(')) return [];

    const expressions = [];
    let currentPos = 0;

    while (true) {
        const syncStart = text.indexOf('sync(', currentPos);
        if (syncStart === -1) break;

        let openParens = 1;
        let endPos = syncStart + 'sync('.length;

        while (openParens > 0 && endPos < text.length) {
            if (text[endPos] === '(') openParens++;
            else if (text[endPos] === ')') openParens--;
            endPos++;
        }

        if (openParens === 0) {
            const original = text.substring(syncStart, endPos);
            const inner = text.substring(syncStart + 'sync('.length, endPos - 1).trim();

            if (!inner) {
                // console.warn(`[Hene] Empty sync() expression: ${original}`);
                currentPos = endPos;
                continue;
            }

            try {
                const ast = acorn.parse(inner, { ecmaVersion: 'latest' });
                if (ast.body.length === 1 && ast.body[0].type === 'ExpressionStatement') {
                    expressions.push({
                        original,
                        inner,
                        start: syncStart,
                        end: endPos,
                        syncTargetAST: ast.body[0].expression
                    });
                } else {
                    // console.warn(`[Hene] Sync inner content not a single expression: ${inner}`);
                }
            } catch (e) {
                // console.warn(`[Hene] Failed to parse sync inner expression: ${inner}`, e);
            }
            currentPos = endPos;
        } else {
            // Mismatched parens, advance past 'sync(' to avoid infinite loop
            currentPos = syncStart + 'sync('.length;
        }
    }
    return expressions;
}


/**
 * Replaces `sync(STATE_INSTANCE)` with `STATE_INSTANCE` in a text string for rendering.
 * @param {string} text - Original text (e.g., attribute value or "${...}" segment).
 * @param {Array<object>} syncExprs - Enriched sync expressions for this text.
 * @returns {Array<object>} Array of { textForRender: string, isDynamic: boolean, relevantSyncs: Array }.
 */
export function processTextForRender(text, syncExprs) {
    let textToRender = text;
    const relevantSyncs = [];
    let isDynamic = false;

    if (syncExprs && syncExprs.length > 0) {
        // Iterate backwards to handle replacements correctly with changing indices
        for (let i = syncExprs.length - 1; i >= 0; i--) {
            const se = syncExprs[i];
            textToRender = textToRender.substring(0, se.start) +
                            se.inner +
                            textToRender.substring(se.end);

            relevantSyncs.push({ syncTargetAST: se.syncTargetAST, originalInnerExpr: se.inner });
            isDynamic = true;
        }
        relevantSyncs.reverse(); // Maintain original order
    }

    return [{
        textForRender: textToRender,
        isDynamic: isDynamic,
        relevantSyncs: relevantSyncs
    }];
}