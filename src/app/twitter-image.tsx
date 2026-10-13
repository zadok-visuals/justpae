/**
 * X/Twitter reads its own tag and ignores the Open Graph one, so the same card
 * is re-exported under the name that convention expects. One drawing, two
 * routes — rather than a second design that drifts from the first.
 */
export { default, size, contentType, alt } from "./opengraph-image";
