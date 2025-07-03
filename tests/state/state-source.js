class StateCases extends HeneElement {
  constructor() {
    super();

    // Two simple states
    this.counter = $state(0);      // Bound in render
    this.other = $state(42);       // Not bound

    // Nested states
    this.data = {
      a: $state('A'),              // Bound in render
      b: $state('B')               // Not bound
    };
  }

  $render = `<span>${this.counter()}</span><div>${this.data.a()}</div>`;
}
