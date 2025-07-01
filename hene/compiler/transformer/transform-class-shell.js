// hene/compiler/transformer/transform-class-shell.js
/**
 * Modifies the class: changes superclass, ensures constructor, etc.
 * For now this delegates to the original transformer implementation.
 */
import { transformHeneClassAST } from '../3-transformer/index.js';

export function transformClassShell(context) {
    if (!context.analysis?.classNode) return;
    transformHeneClassAST(context.analysis.classNode, context.analysis);
}
