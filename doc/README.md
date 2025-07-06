==================================
 Hene: The Comprehensive Guide
==================================

This document provides a detailed explanation of Hene, its abstractions, and its compilation process. It is intended for developers or AI models to gain a complete understanding of how to author Hene components.

----------------------------------
Part 1: Core Concepts
----------------------------------

Hene is a compiler, not a runtime framework. It reads your component's source code and outputs a new version of the code that uses standard browser APIs.

### The HeneElement Base Class

You start by creating a class that extends `HeneElement`.

**Source:**
```javascript
class MyComponent extends HeneElement {
  // ...
}
```

This is simply a marker for the Hene compiler. In the final output, `HeneElement` is replaced with the browser's native `HTMLElement`.

**Compiled Output:**
```javascript
class MyComponent extends HTMLElement {
  // ...
}
```

### The Component Lifecycle

Hene hooks into the standard Web Component lifecycle callbacks. The compiler will often create or add code to these methods for you:

- **`constructor()`**: Used to initialize properties, state, and node references.
- **`connectedCallback()`**: Called when the component is added to the DOM. Hene uses this to build the component's DOM structure (once) and attach event listeners.
- **`disconnectedCallback()`**: Called when the component is removed from the DOM. Hene uses this to clean up event listeners and state watchers to prevent memory leaks.

----------------------------------
Part 2: The `$render` Abstraction
----------------------------------

**Purpose:** To declaratively define your component's HTML structure without writing manual DOM creation calls.

`$render` can be defined in two ways:

1.  **As a class property with a template literal:**
    ```javascript
    class MyComponent extends HeneElement {
      $render = `<h1>Hello, World!</h1>`;
    }
    ```
2.  **As a class method that returns a string:**
    ```javascript
    class MyComponent extends HeneElement {
      constructor() {
        super();
        this.buttonLabel = 'Click me!';
      }

      $render() {
        return `<button>${this.buttonLabel}</button>`;
      }
    }
    ```

**Transformation:**

In both cases, Hene removes the `$render` property/method and creates a private `__build()` method. This new method contains the imperative `document.createElement`, `createTextNode`, and `appendChild` calls needed to construct the DOM tree.

A `__built` flag is added to ensure this build process runs only once. The `connectedCallback` is modified to call `__build()` and append the result.

**Source Code (`render-source.js`):**
```javascript
class RenderCases extends HeneElement {
  constructor() {
    super();
    this.buttonLabel = 'Click me!';
  }

  $render() {
    return `<button>${this.buttonLabel}</button>`;
  }
}
```

**Compiled Output (`render-expected.js`):**
```javascript
class RenderCases extends HTMLElement {
  constructor() {
    super();
    this.__built = false; // Hene adds a build-guard flag
    this.buttonLabel = 'Click me!';
  }
  
  connectedCallback() {
    // Hene adds the build-guard logic and appends the root
    if (!this.__built) {
      this.__build();
      this.__built = true;
    }
    this.appendChild(this._root);
  }
  
  disconnectedCallback() {} // Hene ensures this method exists for cleanup

  // The $render method is gone, replaced by __build()
  __build() {
    // A DocumentFragment is used for efficient appending
    this._root = document.createDocumentFragment(); 
    
    // Imperative DOM creation
    const button = document.createElement("button");
    const _t0 = document.createTextNode(this.buttonLabel);
    button.append(_t0);
    this._root.append(button);
  }
}
```

----------------------------------
Part 3: The `$state` Abstraction
----------------------------------

**Purpose:** To create reactive values ("signals") that automatically update the DOM when they change.

**Declaration & Usage:**
You declare a state variable in the constructor. A state variable is a function.
- Call it with no arguments to **read** the value: `this.count()`
- Call it with one argument to **write** a new value: `this.count(1)`

**Source Code (`state-source.js`):**
```javascript
class StateCases extends HeneElement {
  constructor() {
    super();
    this.counter = $state(0); // Bound in render
    this.data = {
      a: $state('A') // Nested state is supported
    };
  }

  $render = `<span>${this.counter()}</span><div>${this.data.a()}</div>`;
}
```

**Transformation:**

When a `$state` variable is used inside a `${...}` expression in `$render`, Hene performs two key transformations in the `__build` method:

1.  **Initial Rendering:** It creates a text node with the state's initial value.
2.  **Automatic Watcher:** It calls the state's internal `.watch()` method to create a subscription. The callback for this watcher updates the `textContent` of the text node whenever the state's value changes.
3.  **Cleanup:** It stores the `unwatch` function returned by `.watch()` in a private property (e.g., `this._w0`) and calls it in `disconnectedCallback` to prevent memory leaks.

**Compiled Output (`state-expected.js`):**
```javascript
class StateCases extends HTMLElement {
  constructor() {
    super();
    this.__built = false;
    this.counter = $state(0); // The $state call remains as it's a runtime function
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

  // The unwatchers are called on disconnect
  disconnectedCallback() {
    this._w1();
    this._w0();
  }
  
  __build() {
    this._root = document.createDocumentFragment();
    
    // Create elements
    const span = document.createElement("span");
    // 1. Create text node with initial value
    const t_counter = document.createTextNode(this.counter());
    span.append(t_counter);
    
    const div = document.createElement("div");
    const t_data = document.createTextNode(this.data.a());
    div.append(t_data);
    
    this._root.append(span, div);
    
    // 2. Create watchers to sync state changes to the DOM
    // 3. Store the unwatch function in a private property
    this._w0 = this.counter.watch(() => t_counter.textContent = this.counter(), false);
    this._w1 = this.data.a.watch(() => t_data.textContent = this.data.a(), false);
  }
}
```

----------------------------------
Part 4: The `$node` Abstraction
----------------------------------

**Purpose:** To get a direct reference to a specific DOM element from your `$render` template for imperative manipulation.

**Declaration & Usage:**

1.  In the `constructor`, assign a property using `$node('unique-id')`.
2.  In the `$render` template, add a `node="unique-id"` attribute to the target element.

**Source Code (`nodes-source.js`):**
```javascript
class NodesCases extends HeneElement {
  constructor() {
    super();
    // Direct assignment
    this.button = $node('btn');
    // Nested structure is supported
    this.ui = { dialog: { closeBtn: $node('close') } };
  }

  $render = `
    <button node="btn">Hit</button>
    <div   node="close">×</div>
  `;
}
```

**Transformation:**

1.  **Constructor:** The `$node(...)` call is replaced with `null`. This is because the DOM element does not exist at construction time.
2.  **`__build()` Method:**
    *   When `createElement` is called for the element with the `node` attribute, its reference is stored in a local variable (e.g., `const btn = ...`).
    *   Immediately after, that local variable is assigned to the corresponding class property (`this.button = btn;`).

**Compiled Output (`nodes-expected.js`):**
```javascript
class NodesCases extends HTMLElement {
  constructor() {
    super();
    this.__built = false;
    // 1. $node calls are replaced with null initializers
    this.button = null;
    this.ui = {
      dialog: {
        closeBtn: null
      }
    };
  }
  
  connectedCallback() { /* ... Hene setup ... */ }
  disconnectedCallback() {}

  __build() {
    this._root = document.createDocumentFragment();
    
    // 2. Element is created and assigned to a variable AND the class property
    const btn = this.button = document.createElement("button");
    const _t0 = document.createTextNode("Hit");
    btn.append(_t0);
    
    const close = document.createElement("div");
    const _t1 = document.createTextNode("×");
    close.append(_t1);
    
    this._root.append(btn, close);
    
    // 2. The final assignment to ensure the reference is set.
    this.button = btn;
    this.ui.dialog.closeBtn = close;
  }
}
```
*Note: The generated code may have redundant assignments as an artifact of the AST transformation process, but this is functionally harmless.*

----------------------------------
Part 5: The `$event` Abstraction
----------------------------------

**Purpose:** A safe and convenient way to add event listeners to elements referenced by `$node`, with automatic cleanup.

**Declaration & Usage:**
Call `$event` on a `$node` property, typically inside `connectedCallback`.
`this.myNode.$event('click', this.handlerFunction);`

**Source Code (`events-source.js`):**
```javascript
class EventsCases extends HeneElement {
  constructor() {
    super();
    this.btn = $node('btn');
    this.box = $node('box');
    this.handleClick = this.handleClick.bind(this); // Pre-bound method
  }

  handleClick() { console.log('click'); }
  handleMove = (e) => console.log('move', e); // Arrow property

  connectedCallback() {
    // Attach events here
    this.btn.$event('click', this.handleClick);
    this.btn.$event('mouseover', e => console.log('hover', e));
    this.box.$event('mousemove', this.handleMove);
  }

  $render = `<button node="btn">Btn</button><div node="box">Box</div>`;
}
```

**Transformation:**

This is the most involved transformation, designed for safety and correctness.

1.  **Listener Hoisting:** To ensure `removeEventListener` works correctly, Hene cannot use a new function reference each time. For inline arrow functions (`e => ...`), it "hoists" them into a private class property in the constructor (e.g., `this._e0 = e => ...`). This creates a stable reference.
2.  **`connectedCallback`:** The `$event(...)` calls are replaced with standard `this.btn.addEventListener(...)` calls.
3.  **`disconnectedCallback`:** For every `addEventListener` call Hene adds, it automatically adds a corresponding `this.btn.removeEventListener(...)` call in `disconnectedCallback`. This is the primary feature, preventing memory leaks.

**Compiled Output (`events-expected.js`):**
```javascript
class EventsCases extends HTMLElement {
  constructor() {
    super();
    this.__built = false;
    this.btn = null;
    this.box = null;
    this.handleClick = this.handleClick.bind(this);

    // 1. Inline arrow functions are hoisted to stable properties.
    this._e0 = e => console.log('hover', e);
    // Even bound methods can be wrapped for consistency
    this._e1 = e => this.handleClick(e);
  }

  handleClick() { console.log('click'); }
  handleMove = e => console.log('move', e);

  connectedCallback() {
    if (!this.__built) {
      this.__build();
      this.__built = true;
    }
    // 2. $event calls are replaced with addEventListener using the stable references.
    this.btn.addEventListener('click', this._e1, {});
    this.btn.addEventListener('mouseover', this._e0, {});
    this.box.addEventListener('mousemove', this.handleMove, {}); // Arrow properties are already stable
    this.appendChild(this._root);
  }
  
  // 3. Automatic cleanup is generated.
  disconnectedCallback() {
    this.btn.removeEventListener('click', this._e1, false);
    this.btn.removeEventListener('mouseover', this._e0, false);
    this.box.removeEventListener('mousemove', this.handleMove, false);
  }

  __build() {
    // ... DOM creation as seen before ...
  }
}
```

----------------------------------
Part 6: Conclusion
----------------------------------

Hene is a tool for writing Web Components with less boilerplate and more safety. It achieves this by taking your declarative code and transforming it into the efficient, imperative, and standards-compliant vanilla JavaScript that the browser understands best. By understanding these four transformations, you understand all of Hene.
