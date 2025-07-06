class EventsCases extends HTMLElement {
  constructor() {
    super();
    this.__built = false;
    this.btn = null;
    this.box = null;
    this.handleClick = this.handleClick.bind(this);
    this._e0 = e => console.log('hover', e);
    this._e1 = e => this.handleClick(e);
  }
  handleClick() {
    console.log('click');
  }
  handleMove = e => console.log('move', e);
  connectedCallback() {
    if (!this.__built) {
      this.__build();
      this.__built = true;
    }
    this.btn.addEventListener('click', this._e1, {});
    this.btn.addEventListener('mouseover', this._e0, {});
    this.box.addEventListener('mousemove', this.handleMove, {});
    this.appendChild(this._root);
  }
  disconnectedCallback() {
    this.btn.removeEventListener('click', this._e1, false);
    this.btn.removeEventListener('mouseover', this._e0, false);
    this.box.removeEventListener('mousemove', this.handleMove, false);
  }
  __build() {
    this._root = document.createDocumentFragment();
    const btn = this.btn = document.createElement("button");
    const _t0 = document.createTextNode("Btn");
    btn.append(_t0);
    const box = this.box = document.createElement("div");
    const _t1 = document.createTextNode("Box");
    box.append(_t1);
    this._root.append(btn, box);
    this.btn = btn;
    this.box = box;
  }
}
