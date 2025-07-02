export function partsFromMember(member) {
    const p = [];
    let cur = member;
    while (cur && cur.type === 'MemberExpression') {
        if (cur.property.type !== 'Identifier') return null;
        p.unshift(cur.property.name);
        cur = cur.object;
    }
    if (cur && cur.type === 'ThisExpression') {
        p.unshift('this');
    } else if (cur && cur.type === 'Identifier') {
        p.unshift(cur.name);
    } else {
        return null;
    }
    return p;
}
