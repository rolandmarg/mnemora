import { google } from 'googleapis';
import { config } from '../../config.js';
import type { CalendarClient } from '../../types/index.js';

/**
 * Calendar authentication utilities
 */

/**
 * Create a calendar client with read-only permissions
 */
export function createReadOnlyCalendarClient(): CalendarClient {
  if (!config.google.clientEmail || !config.google.privateKey) {
    throw new Error('Google Calendar credentials not configured. Please set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY in .env');
  }

  const auth = new google.auth.JWT(
    config.google.clientEmail,
    undefined,
    config.google.privateKey,
    ['https://www.googleapis.com/auth/calendar.readonly']
  );

  return google.calendar({ version: 'v3', auth });
}

/**
 * Create a calendar client with read-write permissions
 */
export function createReadWriteCalendarClient(): CalendarClient {
  if (!config.google.clientEmail || !config.google.privateKey) {
    throw new Error('Google Calendar credentials not configured. Please set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY in .env');
  }

  const auth = new google.auth.JWT(
    config.google.clientEmail,
    undefined,
    config.google.privateKey,
    ['https://www.googleapis.com/auth/calendar']
  );

  return google.calendar({ version: 'v3', auth });
}

