// hene/compiler/transformer/transform-class-shell.js
/** Modifies the class shell: superclass, constructor, and lifecycle hooks. */

export function ensureConstructor(classBody) {
    let ctor = classBody.find(m => m.type === 'MethodDefinition' && m.kind === 'constructor');
    if (!ctor) {
        ctor = {
            type: 'MethodDefinition', kind: 'constructor', static: false, computed: false,
            key: { type: 'Identifier', name: 'constructor' },
            value: {
                type: 'FunctionExpression', id: null, params: [],
                body: { type: 'BlockStatement', body: [] },
                async: false, generator: false, expression: false
            }
        };
        classBody.unshift(ctor);
    }
    return ctor;
}

export function prependSuperCall(ctorNode) {
    if (!ctorNode?.value?.body) return;
    const bodyStmts = ctorNode.value.body.body;
    const hasSuper = bodyStmts.some(
        s => s.type === 'ExpressionStatement' && s.expression.type === 'CallExpression' && s.expression.callee.type === 'Super'
    );
    if (!hasSuper) {
        bodyStmts.unshift({
            type: 'ExpressionStatement',
            expression: { type: 'CallExpression', callee: { type: 'Super' }, arguments: [], optional: false }
        });
    }
}

export function ensureConnectedCallback(classBody) {
    let cb = classBody.find(m => m.type === 'MethodDefinition' && m.key?.name === 'connectedCallback');
    if (!cb) {
        cb = {
            type: 'MethodDefinition', kind: 'method', static: false, computed: false,
            key: { type: 'Identifier', name: 'connectedCallback' },
            value: {
                type: 'FunctionExpression', id: null, params: [],
                body: { type: 'BlockStatement', body: [] },
                async: false, generator: false, expression: false
            }
        };
        classBody.push(cb);
    }
    return cb;
}

export function ensureDisconnectedCallback(classBody) {
    let cb = classBody.find(m => m.type === 'MethodDefinition' && m.key?.name === 'disconnectedCallback');
    if (!cb) {
        cb = {
            type: 'MethodDefinition', kind: 'method', static: false, computed: false,
            key: { type: 'Identifier', name: 'disconnectedCallback' },
            value: {
                type: 'FunctionExpression', id: null, params: [],
                body: { type: 'BlockStatement', body: [] },
                async: false, generator: false, expression: false
            }
        };
        classBody.push(cb);
    }
    return cb;
}

/**
 * Apply class shell transformations.
 * @param {import('../context.js').Context} context
 */
export function transformClassShell(context) {
    const classNode = context.analysis.classNode;
    if (!classNode) return;
    classNode.superClass.name = 'HTMLElement';
    const classBody = classNode.body.body;
    const ctor = ensureConstructor(classBody);
    context.analysis.ctor = ctor;
    const connectedCb = ensureConnectedCallback(classBody);
    const disconnectedCb = ensureDisconnectedCallback(classBody);
    context.analysis.connectedCb = connectedCb;
    context.analysis.disconnectedCb = disconnectedCb;
    prependSuperCall(ctor);
}
