class NodesCases extends HTMLElement {
  constructor() {
    super();
    this.__built = false;
    this.button = null;
    this.ui = {
      dialog: {
        closeBtn: null
      }
    };
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
    const btn = this.button = document.createElement("button");
    const _t0 = document.createTextNode("Hit");
    btn.append(_t0);
    const close = document.createElement("div");
    const _t1 = document.createTextNode("×");
    close.append(_t1);
    this._root.append(btn, close);
    this.button = btn;
    this.ui.dialog.closeBtn = close;
    this.ui.dialog.closeBtn = close;
  }
}
