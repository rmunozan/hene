// hene/compiler/analyzer/analyze-nodes.js
/**
 * Identifies all `$node()` calls and records their metadata.
 */
import { createNodeTracker, scanNodesFromObject, scanNodeAssignment, hasNodeCall } from '../2-analyzer/nodes.js';
import { heneError } from '../utils/errors/error.js';

export function analyzeNodes(context) {
    const cls = context.analysis?.classNode;
    if (!cls) return;
    const classBody = cls.body.body;
    const ctor = context.analysis.ctor;
    const tracker = createNodeTracker();

    for (const member of classBody) {
        if (member.type === 'PropertyDefinition' && member.value && member.value.type === 'ObjectExpression') {
            scanNodesFromObject(member.value, ['this', member.key.name], tracker);
        }
    }

    for (const member of classBody) {
        if (member === ctor) continue;
        if (hasNodeCall(member)) {
            throw heneError('$node() can only be used inside the constructor');
        }
    }

    if (ctor) {
        const ctorBody = ctor.value.body.body;
        for (const stmt of ctorBody) {
            if (stmt.type === 'ExpressionStatement' && stmt.expression.type === 'AssignmentExpression' && stmt.expression.operator === '=') {
                const parts = scanNodeAssignment(stmt.expression, tracker);
                if (stmt.expression.right.type === 'ObjectExpression' && parts) {
                    scanNodesFromObject(stmt.expression.right, parts, tracker);
                }
            }
        }
    }

    context.analysis.nodeTracker = tracker;
}
