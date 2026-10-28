/**
 * Where the CRP Mentor Copilot app lives. Set VITE_APP_URL in landing/.env (e.g. https://app.crpcopilot.in) when it goes
 * live; locally it is the app's development server.
 */
export const APP_URL = (import.meta.env.VITE_APP_URL || 'http://localhost:3000').replace(/\/$/, '')

/** Full address of an app page, e.g. appLink('/visit'). */
export const appLink = (path = '/') => `${APP_URL}${path}`
