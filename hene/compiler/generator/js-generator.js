// hene/compiler/generator/js-generator.js
/**
 * Converts the final, transformed AST back into JavaScript code.
 */
import { generate } from 'astring';

export function generateJavaScript(context) {
    context.output.code = generate(context.jsAst);
}
