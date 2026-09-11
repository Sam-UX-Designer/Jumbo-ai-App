/**
 * The Vercel entry point.
 *
 * Vercel routes every /api/* request here (see vercel.json) and the Express
 * app handles it exactly as it does locally. There is no separate production
 * implementation to drift out of step.
 */
export { app as default } from '../server/app.js'
