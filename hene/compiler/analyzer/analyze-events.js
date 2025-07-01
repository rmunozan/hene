// hene/compiler/analyzer/analyze-events.js
/**
 * Identifies all `$event()` calls and records their metadata.
 * Currently unused as event transformation happens later.
 */
export function analyzeEvents(context) {
    context.analysis.events = [];
}
