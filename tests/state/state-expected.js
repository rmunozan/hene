class StateCases extends HTMLElement {
  constructor() {
    super();
    this.__built = false;
    this.counter = $state(0);
    this.other = $state(42);
    this.data = {
      a: $state('A'),
      b: $state('B')
    };
  }
  connectedCallback() {
    if (!this.__built) {
      this.__build();
      this.__built = true;
    }
    this.appendChild(this._root);
  }
  disconnectedCallback() {
    this._w1();
    this._w0();
  }
  __build() {
    this._root = document.createDocumentFragment();
    const span = document.createElement("span");
    const t_counter = document.createTextNode(this.counter());
    span.append(t_counter);
    const div = document.createElement("div");
    const t_data = document.createTextNode(this.data.a());
    div.append(t_data);
    this._root.append(span, div);
    this._w0 = this.counter.watch(() => t_counter.textContent = this.counter(), false);
    this._w1 = this.data.a.watch(() => t_data.textContent = this.data.a(), false);
  }
}
