// hene/compiler/transformer/transform-initializers.js
import { collectNodesFromObject, inspectNodeAssignment } from '../analyzer/analyze-nodes.js';

/**
 * Replace $node() calls with null initializers in property definitions and
 * constructor assignments.
 * @param {import('../context.js').Context} context
 */
export function transformInitializers(context) {
    const classNode = context.analysis.classNode;
    const nodeTracker = context.analysis.nodeTracker;
    if (!classNode || !nodeTracker) return;

    const classBody = classNode.body.body;
    const ctor = context.analysis.ctor;

    for (const member of classBody) {
        if (member.type === 'PropertyDefinition' && member.value && member.value.type === 'ObjectExpression') {
            if (member.key.type !== 'Identifier') continue;
            collectNodesFromObject(member.value, ['this', member.key.name], nodeTracker);
        }
    }

    if (ctor) {
        const ctorBody = ctor.value.body.body;
        for (const stmt of ctorBody) {
            if (stmt.type === 'ExpressionStatement' && stmt.expression.type === 'AssignmentExpression' && stmt.expression.operator === '=') {
                inspectNodeAssignment(stmt.expression, nodeTracker);
            }
        }
    }

    const idx = context.analysis.builtIdx;
    if (idx !== -1 && ctor) {
        ctor.value.body.body.splice(idx, 1);
    }
}
