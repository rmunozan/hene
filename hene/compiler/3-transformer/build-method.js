// hene/compiler/transforms/render.js
/**
 * @fileoverview Processes a class `$render` string into DOM creation
 * statements and watcher metadata.
 */
import { buildDomInstructionsAST } from './dom_generator.js';
import { makeMemberAst } from '../utils/ast-builder.js';

/**
 * Transform a `$render` HTML string.
 *
 * @param {string} html - extracted HTML from `$render`.
 * @param {Map<string, object>} reactiveStates - map of `$state` references.
 * @param {Map<string, object[]>} nodeRefs - tracker from node transform.
 * @returns {{statements: object[], watchers: Array<object>}}
 */
export function processRender(html, reactiveStates, nodeRefs) {
    const { creation_statements, node_map, sync_watchers } = buildDomInstructionsAST(html, reactiveStates);
    const stmts = [...creation_statements];

    Object.entries(node_map).forEach(([name, varName]) => {
        const refs = nodeRefs.get(name);
        if (!refs) return;
        const declIdx = stmts.findIndex(s => s.type === 'VariableDeclaration' && s.declarations[0].id.name === varName);
        refs.forEach((ast, idx) => {
            if (idx === 0 && declIdx >= 0 && ast.type === 'MemberExpression' && ast.object.type === 'ThisExpression') {
                const init = stmts[declIdx].declarations[0].init;
                stmts[declIdx].declarations[0].init = {
                    type: 'AssignmentExpression',
                    operator: '=',
                    left: ast,
                    right: init
                };
            } else {
                stmts.push({
                    type: 'ExpressionStatement',
                    expression: {
                        type: 'AssignmentExpression',
                        operator: '=',
                        left: ast,
                        right: { type: 'Identifier', name: varName }
                    }
                });
            }
        });
    });

    return { statements: stmts, watchers: sync_watchers };
}
