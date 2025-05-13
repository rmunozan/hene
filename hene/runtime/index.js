// hene/runtime/state.js

/**
 * @private
 * @type {Array<[Function, any]>}
 * @description Internal queue that holds watcher callbacks and their new values, to be executed in the next microtask.
 */
const _queue = []; // Changed var to const

/**
 * @private
 * @type {number}
 * @description Internal index for the next insertion point in the queue.
 */
let _queue_index = 0; // Changed var to let

/**
 * @private
 * @type {boolean}
 * @description Flag indicating whether the queue has already been scheduled for flushing.
 */
let _scheduled = false; // Changed var to let

/**
 * @private
 * @function
 * @description Enqueue a callback to be called with the new value during the next microtask.
 * Avoids multiple scheduling by using a `_scheduled` flag.
 * 
 * @param {Function} callback - The function to be called when the queue is flushed.
 * @param {any} new_value - The value to pass to the callback when it is invoked.
 * @returns {void}
 */
function _enqueue(callback, new_value) {
    _queue[_queue_index] = [ callback, new_value ];
    _queue_index++;
    if (_scheduled) return;
    _scheduled = true;
    queueMicrotask(_flush);
}

/**
 * @private
 * @function
 * @description Flush the queue. This will call all the callbacks in the queue with their respective new values.
 * After flushing, the queue is cleared and the index is reset.
 * @returns {void}
 */
function _flush() {
    _scheduled = false;
    const q = _queue.slice(0, _queue_index); // Process only filled part
    _queue.length = 0; 
    _queue_index = 0;

    for (let i = 0, len = q.length; i < len; i++) {
        const item = q[i];
        if (item) { // Check if item is not null (due to unwatch)
            const [ callback, new_value ] = item;
            callback(new_value);
        }
    }
}

/**
 * @class State
 * @description A class that allows you to create a state variable that can be watched for changes.
 * When the state changes, all watchers are notified either immediately or during the next microtask.
 */
class State {
    /**
     * @constructor
     * @param {any} [initial=null] - The initial value of the state variable.
     */
    constructor(initial = null) {
        this.value = initial;
        this._watchers = [];
        this._watchers_index = 0;
    }

    /**
     * @method
     * @description Get the current value of the state variable.
     * @returns {any} The current value.
     */
    get() {
        return this.value;
    }

    /**
     * @method
     * @description Set the value of the state variable and notify all watchers.
     * Watchers marked as immediate will be executed synchronously,
     * others will be enqueued and executed in the next microtask.
     * 
     * @param {any} new_value - The new value to assign to the state variable.
     * @returns {void}
     */
    set(new_value) {
        if (new_value === this.value) return;
        this.value = new_value;

        for (let i = 0; i < this._watchers_index; i++) {
            if (this._watchers[i] === null) continue;
            const [callback, immediate] = this._watchers[i];
            if (immediate) {
                callback(this.value);
            } else {
                _enqueue(callback, this.value);
            }
        }
    }

    /**
     * @method
     * @description Register a new watcher function for the state.
     * Watchers can be executed immediately or batched in the microtask queue.
     * 
     * @param {Function} callback - The function to call when the state changes.
     * @param {boolean} [immediate=false] - Whether to call the watcher immediately on change.
     * @returns {Function} A function to unwatch (unsubscribe) this watcher.
     */
    watch(callback, immediate = false)  {
        if (typeof callback !== 'function') throw new TypeError('Expected a function for watch callback');

        const index = this._watchers_index;
        this._watchers[index] = [ callback, immediate ];
        this._watchers_index++;

        // Initial call if immediate is true and value is not null/undefined (optional, Syna didn't do this for $sync)
        // For $sync, initial value is set by the initial render. Watchers are for changes.
        // If `immediate` implies "run now and on change", then:
        // if (immediate) callback(this.value); 

        return () => {
            this._watchers[index] = null;
            // Optimization: could compact array or use a different data structure if many unsubs
        };
    }
}

/**
 * Factory function to create a new State instance.
 * @param {any} initial - The initial value for the state.
 * @returns {State} A new State instance.
 */
export function $state(initial) {
    return new State(initial);
}
