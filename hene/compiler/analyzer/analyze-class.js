// hene/compiler/analyzer/analyze-class.js
/**
 * Finds the Hene class node that requires compilation.
 */
import { createStateMap } from '../2-analyzer/state.js';

export function findHeneClass(context) {
    const program = context.jsAst;
    if (!program || !Array.isArray(program.body)) return;
    for (const node of program.body) {
        if (
            node?.type === 'ClassDeclaration' &&
            node.superClass?.type === 'Identifier' &&
            node.superClass.name === 'HeneElement'
        ) {
            const classBody = node.body.body;
            const ctor = classBody.find(m => m.type === 'MethodDefinition' && m.kind === 'constructor');
            context.analysis = { classNode: node, ctor, stateMap: createStateMap(), nodeTracker: null, renderHTML: null, builtIdx: -1 };
            return;
        }
    }
    context.analysis = {};
}
