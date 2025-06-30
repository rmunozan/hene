export function makeMemberAst(parts) {
    let expr = parts[0] === 'this'
        ? { type: 'ThisExpression' }
        : { type: 'Identifier', name: parts[0] };
    for (let i = 1; i < parts.length; i++) {
        expr = {
            type: 'MemberExpression',
            object: expr,
            property: { type: 'Identifier', name: parts[i] },
            computed: false
        };
    }
    return expr;
}
