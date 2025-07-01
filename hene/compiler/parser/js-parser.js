// hene/compiler/parser/js-parser.js
/**
 * Parses a source string into a JavaScript AST using Acorn.
 */
import * as acorn from 'acorn';

export function parseJavaScript(context) {
    context.jsAst = acorn.parse(context.sourceCode, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        locations: true
    });
}
