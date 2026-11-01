/*
 * Shared choreography timings (ms), so every section staggers and sequences
 * with the same rhythm. Easing curves live in index.css (@theme).
 */

/** Gap between items that enter one after another. */
export const STAGGER = 140

/** How long a string or thread draws before what hangs from it starts to enter. */
export const THREAD_LEAD = 450

/**
 * When a drawn path (0.3s delay + 2.6s ease-draw) reaches points at 12.5%,
 * 37.5%, 62.5% and 87.5% of its length: used to land markers as the line arrives.
 */
export const PATH_MILESTONES = [950, 1470, 1730, 2250]
