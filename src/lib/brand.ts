/**
 * Single source of truth for product branding.
 * Change the name here and it updates the UI, document metadata,
 * and the generated calendar files (PRODID / UID / organizer fallback).
 */
export const BRAND = {
  name: "Cue",
  tagline: "The fastest way to create Apple Calendar events.",
  description:
    "Turn a message, email, or screenshot into a polished calendar event and add it to Apple Calendar, Google Calendar, or Outlook in seconds.",
  // Used for technical identifiers inside generated .ics files.
  domain: "cue.app",
  productId: "-//Cue//Calendar Event Builder//EN",
} as const;

export const ORGANIZER_FALLBACK_EMAIL = `noreply@${BRAND.domain}`;
