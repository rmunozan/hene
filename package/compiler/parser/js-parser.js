// hene/compiler/parser/js-parser.js
/**
 * Parses JavaScript source into an ESTree-compliant AST using Acorn.
 */
import * as acorn from 'acorn';

/**
 * @param {import('../context.js').Context} context
 */
export function parseJavaScript(context) {
    context.jsAst = acorn.parse(context.sourceCode, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        locations: true
    });
}
