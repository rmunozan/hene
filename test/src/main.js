import { $state } from "hene/runtime";

class counter extends HeneElement {
	constructor() {
		this.count = $state(0);
		this.$built();
		this.nodes.btn.$event("click", this.increase);
	}

	increase = () => this.count.set(this.count.get() + 1);

	$render() {
		return `
			<h1>The current value: ${sync(this.count).get()}</h1> 
			<button node="btn">Increase</button>
		`
	}
}

customElements.define("counter-comp", counter);

