class EventsCases extends HeneElement {
  constructor() {
    super();

    // Simple $node assignments
    this.btn = $node('btn');
    this.box = $node('box');

    // Bound prototype method
    this.handleClick = this.handleClick.bind(this);
  }

  handleClick() { console.log('click'); }

  // Arrow as instance property
  handleMove = (e) => console.log('move', e);

  connectedCallback() {
    // Bound method
    this.btn.$event('click', this.handleClick, {});

    // Inline arrow
    this.btn.$event('mouseover', e => console.log('hover', e), {});

    // Arrow property
    this.box.$event('mousemove', this.handleMove, {});
  }

  $render = `
    <button node="btn">Btn</button>
    <div   node="box">Box</div>
  `;
}
