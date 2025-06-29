// hene/compiler/pipeline.js
/**
 * @fileoverview Defines the ordered transformation pipeline for Hene.
 */
import { transformHeneClassAST } from './transforms/class.js';

/**
 * Apply all compiler transforms to the given program AST.
 * @param {object} ast - Parsed Program AST (Acorn format).
 */
export default function runPipeline(ast) {
    if (!ast || !Array.isArray(ast.body)) return;
    for (const node of ast.body) {
        if (
            node?.type === 'ClassDeclaration' &&
            node.superClass?.type === 'Identifier' &&
            node.superClass.name === 'HeneElement'
        ) {
            transformHeneClassAST(node);
        }
    }
}
