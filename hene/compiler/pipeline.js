// hene/compiler/pipeline.js
/**
 * @fileoverview Defines the ordered transformation pipeline for Hene.
 */
import { analyzeClass } from './2-analyzer/index.js';
import { transformHeneClassAST } from './3-transformer/index.js';

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
            const context = analyzeClass(node);
            transformHeneClassAST(node, context);
        }
    }
}
