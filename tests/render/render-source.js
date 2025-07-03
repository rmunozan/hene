class RenderCases extends HeneElement {
  constructor() {
    super();
    this.buttonLabel = 'Click me!';
  }

  $render() {
    return `<button>${this.buttonLabel}</button>`;
  }
}
