// hene/compiler/generator/js-generator.js
import { generate } from 'astring';

/**
 * Convert the transformed AST back into JavaScript code.
 * @param {import('../context.js').Context} context
 */
export function generateJavaScript(context) {
    context.output.code = generate(context.jsAst);
}
