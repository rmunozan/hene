import { $state } from "hene";

class Counter extends HeneElement {
        constructor() {
                this.count = $state(0);
                this.button = $node('btn', 'extra');
        }

	connectedCallback() {
		this.button.$event('click', () => this.count(this.count() + 1));
	}

	$render(){
		return `
			<h1>Current value: ${this.count()}</h1>
			<button node="btn">Increase</button>
		`;
	}
}

customElements.define('counter-comp', Counter);
