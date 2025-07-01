import { $state } from "../../hene";

class hello extends HeneElement {
	constructor() {
		this.text = $state('');
		this.input = $node('input');
		console.log(this.input);
	}

	update(e) {
		console.log(e);
		this.text(this.input.value);
	}

	connectedCallback() {
		this.input.$event('input', this.update);
	}

	$render() {
		return `
			<h1>Hello ${this.text()}</h1>
			<input node="input" />
		`
	}
}

customElements.define("hello-world", hello);

