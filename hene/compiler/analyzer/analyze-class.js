// hene/compiler/analyzer/analyze-class.js
/**
 * Finds the Hene class that extends `HeneElement` within the parsed AST.
 * Records constructor node and index of `$built()` call if present.
 */

/**
 * @param {import('../context.js').Context} context
 */
export function findHeneClass(context) {
    const program = context.jsAst;
    if (!program || !Array.isArray(program.body)) {
        context.analysis = {};
        return;
    }
    let classNode = null;
    for (const node of program.body) {
        if (node?.type === 'ClassDeclaration' && node.superClass?.type === 'Identifier' && node.superClass.name === 'HeneElement') {
            classNode = node;
            break;
        }
    }
    context.analysis = { classNode };
    if (!classNode) return;

    const classBody = classNode.body.body;
    const ctor = classBody.find(m => m.type === 'MethodDefinition' && m.kind === 'constructor') || null;
    context.analysis.ctor = ctor;
    let builtIdx = -1;
    if (ctor) {
        const ctorBody = ctor.value.body.body;
        for (const stmt of ctorBody) {
            if (
                stmt.type === 'ExpressionStatement' &&
                stmt.expression.type === 'CallExpression' &&
                stmt.expression.callee.type === 'MemberExpression' &&
                stmt.expression.callee.object.type === 'ThisExpression' &&
                stmt.expression.callee.property.type === 'Identifier' &&
                stmt.expression.callee.property.name === '$built'
            ) {
                builtIdx = ctorBody.indexOf(stmt);
                break;
            }
        }
    }
    context.analysis.builtIdx = builtIdx;
}
