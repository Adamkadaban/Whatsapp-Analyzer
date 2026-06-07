/**
 * Centralized constants for the WhatsApp Analyzer application.
 * These values affect business logic and should be easy to find and modify.
 */

// ============================================================================
// Analysis Limits
// ============================================================================

/** Maximum number of top words to retrieve from the WASM analysis. */
export const ANALYSIS_TOP_WORDS = 50;

/** Maximum number of top emojis to retrieve from the WASM analysis. */
export const ANALYSIS_TOP_EMOJIS = 50;

// ============================================================================
// Chart Display
// ============================================================================

/** Maximum number of senders to show in chart legends before hiding the legend. */
export const MAX_LEGEND_SENDERS = 6;

// ============================================================================
// Processing UI
// ============================================================================

/** Seconds after which "Just a few more seconds…" message appears. */
export const PROCESSING_SLOW_THRESHOLD_SEC = 10;

/** Seconds after which "You must text a lot!" message appears. */
export const PROCESSING_VERY_SLOW_THRESHOLD_SEC = 30;

// ============================================================================
// PDF Export
// ============================================================================

/**
 * Maximum dimension (width or height in pixels) for PDF canvas to stay within jsPDF limits.
 *
 * jsPDF clamps any page dimension above 14,400 userUnits. The PDF export uses
 * `unit: "px"` with the `px_scaling` hotfix (factor 72/96 = 0.75), so the safe
 * pixel ceiling is 14,400 / 0.75 = 19,200px. We stay comfortably under that.
 */
export const PDF_MAX_DIMENSION_PX = 14000;

/** Maximum scale factor for PDF rendering (for crispness). */
export const PDF_MAX_SCALE = 2;

/** Extra vertical buffer (pixels) added to PDF height for banner spacing. */
export const PDF_HEIGHT_BUFFER_PX = 80;

// ============================================================================
// Date/Time Labels
// ============================================================================

/** Short month labels for chart axes. */
export const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** Short weekday labels for chart axes (starting Sunday). */
export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
