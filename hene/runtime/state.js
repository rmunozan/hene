/**
 * hene/runtime/state.js
 *
 * Reactive "signal" primitive — Proxy‑free, micro‑task batched, V8‑friendly.
 *
 * Usage:
 *   const count = $state(0);
 *   count();          // => 0   (read)
 *   count(1);         // write; notifies watchers
 *   count.watch(fn);  // subscribe
 */

/**
 * @private
 * Internal micro‑task queue for batched watcher notifications.
 * Re‑uses a simple ring‑buffer (array + index) to minimise allocations.
 */
const _queue = [];
let _queue_index = 0;
let _scheduled = false;

function _enqueue (callback, new_value) {
    _queue[_queue_index++] = [callback, new_value];
    if (_scheduled) return;
    _scheduled = true;
    queueMicrotask(_flush);
}

function _flush () {
    _scheduled = false;
    for (let i = 0; i < _queue_index; i++) {
        const item = _queue[i];
        if (item) {
            const [cb, val] = item;
            cb(val);
        }
    }
    _queue.length = 0;
    _queue_index  = 0;
}

/**
 * Create a reactive signal.
 *
 * A *signal* is a function; call it with no arguments to **read** the value,
 * call it with a single argument to **write** the value.  It also exposes
 * `signal.watch(cb, immediate?)` to subscribe to changes.
 *
 * @template T
 * @param {T} [initial=null]
 * @returns {(next?: T) => T}
 */
export function $state (initial = null) {
    let value = initial;

    /** @type {Array<[Function, boolean]>} */
    const _watchers = [];
    let _watchers_index = 0;

    /**
     * The signal function (read/write).
     * @param {any} [new_value]
     * @returns {any}
     */
    function signal (new_value) {
        // READ
        if (arguments.length === 0) return value;

        // WRITE (no‑op if unchanged)
        if (new_value === value) return value;
        value = new_value;

        for (let i = 0; i < _watchers_index; i++) {
            const entry = _watchers[i];
            if (!entry) continue;
            const [callback, immediate] = entry;
            if (immediate) {
                callback(value);
            } else {
                _enqueue(callback, value);
            }
        }
        return value;
    }

    /**
     * Subscribe to value changes.
     * @param {(val: any) => void} callback
     * @param {boolean} [immediate=false]
     * @returns {() => void} unwatch – unsubscribe function
     */
    signal.watch = function (callback, immediate = false) {
        if (typeof callback !== 'function') {
            throw new TypeError('Expected a function for watch callback');
        }
        const idx = _watchers_index;
        _watchers[idx] = [callback, immediate];
        _watchers_index++;
        return () => { _watchers[idx] = null; };
    };

    return signal;
}
