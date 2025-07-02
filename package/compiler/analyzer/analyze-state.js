// hene/compiler/analyzer/analyze-state.js
import { makeMemberAst } from "../utils/ast/ast-builder.js";

export function createStateMap() { return new Map(); }
export function recordState(parts, map) {
    const key = parts.join('.');
    if (!map.has(key)) map.set(key, makeMemberAst(parts));
}
export function collectStatesFromObject(objExpr, baseParts, map) {
    for (const prop of objExpr.properties || []) {
        if (prop.type !== 'Property' || prop.key.type !== 'Identifier') continue;
        const val = prop.value;
        const newParts = baseParts.concat(prop.key.name);
        if (val.type === 'CallExpression' && val.callee.type === 'Identifier' && val.callee.name === '$state') {
            recordState(newParts, map);
        } else if (val.type === 'ObjectExpression') {
            collectStatesFromObject(val, newParts, map);
        }
    }
}
export function inspectStateAssignment(assignExpr, map) {
    const left = assignExpr.left;
    const right = assignExpr.right;
    if (left.type !== 'MemberExpression') return;
    const parts = [];
    let cur = left;
    while (cur.type === 'MemberExpression') {
        if (cur.property.type !== 'Identifier') return;
        parts.unshift(cur.property.name);
        cur = cur.object;
    }
    if (cur.type === 'ThisExpression') parts.unshift('this');
    else if (cur.type === 'Identifier') parts.unshift(cur.name); else return;

    if (right.type === 'CallExpression' && right.callee.type === 'Identifier' && right.callee.name === '$state') {
        recordState(parts, map);
    } else if (right.type === 'ObjectExpression') {
        collectStatesFromObject(right, parts, map);
    }
}

/**
 * Analyze $state usage and store map on context.analysis.stateMap.
 * @param {import('../context.js').Context} context
 */
export function analyzeState(context) {
    const classNode = context.analysis.classNode;
    if (!classNode) return;

    const classBody = classNode.body.body;
    const stateMap = createStateMap();

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

    const ctor = context.analysis.ctor;
    if (ctor) {
        const ctorBody = ctor.value.body.body;
        for (const stmt of ctorBody) {
            if (stmt.type === 'ExpressionStatement' && stmt.expression.type === 'AssignmentExpression' && stmt.expression.operator === '=') {
                inspectStateAssignment(stmt.expression, stateMap);
                if (stmt.expression.right.type === 'ObjectExpression') {
                    const parts = [];
                    let cur = stmt.expression.left;
                    while (cur.type === 'MemberExpression') {
                        if (cur.property.type !== 'Identifier') { cur = null; break; }
                        parts.unshift(cur.property.name);
                        cur = cur.object;
                    }
                    if (cur && (cur.type === 'ThisExpression' || cur.type === 'Identifier')) {
                        if (cur.type === 'ThisExpression') parts.unshift('this');
                        else parts.unshift(cur.name);
                        collectStatesFromObject(stmt.expression.right, parts, stateMap);
                    }
                }
            }
        }
    }

    context.analysis.stateMap = stateMap;
}
