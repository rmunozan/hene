# Hene

A tiny compiler for building web components in plain JavaScript. Hene offers a few simple abstractions to help you write efficient, performant components in a nicer way.

It offers 4 minimal abstractions and nothing more. Your code stays simple, transparent, and predictable.


## Principles

- **Predictable**  
  Every abstraction has a predictable transformation.

- **Explicit**  
  What you write is exactly what you get in the browser.


## Core Abstractions

Learn more in [doc/README.md](doc/README.md).

- **`$state`**  
  Create individual values that drive your UI and update automatically when they change.

- **`$node`**  
  Tag elements in your template so you can grab and manipulate them directly in your code.

- **`$event`**  
  Attach and manage event listeners on your elements, with built-in cleanup when the component is removed.

- **`$render`**  
  Define your component’s HTML structure as a simple template that Hene uses to build the DOM.


## Quick Start

1. **Install**

   ```bash
   npm install hene
   ```

2. **Setup** (with Vite)

   ```js
   // vite.config.js
   import { defineConfig } from 'vite';
   import { heneCompiler } from 'hene/compiler';

   export default defineConfig({
     root: 'src',
     plugins: [
       heneCompiler()
     ]
   });
   ```

---

That’s it—four clear, straightforward tools for building web components without surprises. Hene does just enough to keep your code tidy, then lets you control the rest.
