class RenderCases extends HTMLElement {
  constructor() {
    super();
    this.__built = false;
    this.buttonLabel = 'Click me!';
  }
  connectedCallback() {
    if (!this.__built) {
      this.__build();
      this.__built = true;
    }
    this.appendChild(this._root);
  }
  disconnectedCallback() {}
  __build() {
    this._root = document.createDocumentFragment();
    const button = document.createElement("button");
    const _t0 = document.createTextNode(this.buttonLabel);
    button.append(_t0);
    this._root.append(button);
  }
}
