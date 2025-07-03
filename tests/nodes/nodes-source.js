class NodesCases extends HeneElement {
  constructor() {
    super();

    // Direct assignment
    this.button = $node('btn');

    // Nested structure
    this.ui = { dialog: { closeBtn: $node('close') } };
  }

  $render = `
    <button node="btn">Hit</button>
    <div   node="close">×</div>
  `;
}
