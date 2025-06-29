import { $state } from "hene/runtime";

class counter extends HeneElement {
        constructor() {
                this.count = $state(0);
                this.btn = $node('btn');
        }

        connectedCallback() {
                this.btn.$event("click", this.increase);
        }

        increase = () => this.count(this.count() + 1);

        $render() {
                return `
                        <h1>The current value: ${this.count()}</h1>
                        <button node="btn">Increase</button>
                `
        }
}

customElements.define("counter-comp", counter);

