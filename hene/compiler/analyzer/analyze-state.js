// hene/compiler/analyzer/analyze-state.js
/**
 * Identifies all `$state()` declarations and records their metadata.
 */
import { recordState, collectStatesFromObject, inspectStateAssignment } from '../2-analyzer/state.js';

export function analyzeState(context) {
    const cls = context.analysis?.classNode;
    if (!cls) return;
    const classBody = cls.body.body;
    const stateMap = context.analysis.stateMap;
    const ctor = context.analysis.ctor;

    for (const member of classBody) {
        if (member.type === 'PropertyDefinition' && member.value) {
            if (member.key.type !== 'Identifier') continue;
            const base = ['this', member.key.name];
            const val = member.value;
            if (val.type === 'CallExpression' && val.callee.type === 'Identifier' && val.callee.name === '$state') {
                recordState(base, stateMap);
            } else if (val.type === 'ObjectExpression') {
                collectStatesFromObject(val, base, stateMap);
            }
        }
    }

    if (ctor) {
        const ctorBody = ctor.value.body.body;
        for (const stmt of ctorBody) {
            if (stmt.type === 'ExpressionStatement' && stmt.expression.type === 'AssignmentExpression' && stmt.expression.operator === '=') {
                inspectStateAssignment(stmt.expression, stateMap);
            }
        }
    }
}
