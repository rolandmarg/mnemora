import { describe, it, expect } from 'vitest';
import { calendar_v3 } from 'googleapis';
import { formatEvent, formatEventForDuplicate } from '../event-formatter.js';

describe('event-formatter', () => {
  describe('formatEvent', () => {
    it('should format event with all fields', () => {
      const event: calendar_v3.Schema$Event = {
        summary: 'Test Event',
        start: { date: '2024-05-15' },
        location: 'Test Location',
        description: 'Test Description',
        recurrence: ['RRULE:FREQ=YEARLY'],
      };

      const result = formatEvent(event);
      expect(result).toContain('Test Event');
      expect(result).toContain('2024-05-15');
      expect(result).toContain('Test Location');
      expect(result).toContain('Test Description');
      expect(result).toContain('Recurring: Yes');
    });

    it('should format event with minimal fields', () => {
      const event: calendar_v3.Schema$Event = {
        summary: 'Test Event',
        start: { date: '2024-05-15' },
      };

      const result = formatEvent(event);
      expect(result).toContain('Test Event');
      expect(result).toContain('2024-05-15');
    });

    it('should handle event with no title', () => {
      const event: calendar_v3.Schema$Event = {
        start: { date: '2024-05-15' },
      };

      const result = formatEvent(event);
      expect(result).toContain('(No title)');
    });

    it('should truncate long descriptions', () => {
      const longDescription = 'a'.repeat(150);
      const event: calendar_v3.Schema$Event = {
        summary: 'Test Event',
        start: { date: '2024-05-15' },
        description: longDescription,
      };

      const result = formatEvent(event);
      expect(result).toContain('...');
      expect(result.length).toBeLessThan(longDescription.length + 100);
    });

    it('should handle event with dateTime', () => {
      const event: calendar_v3.Schema$Event = {
        summary: 'Test Event',
        start: { dateTime: '2024-05-15T10:00:00Z' },
      };

      const result = formatEvent(event);
      expect(result).toContain('2024-05-15T10:00:00Z');
    });
  });

  describe('formatEventForDuplicate', () => {
    it('should format event for duplicate checking', () => {
      const event: calendar_v3.Schema$Event = {
        summary: 'Test Event',
        start: { date: '2024-05-15' },
      };

      const result = formatEventForDuplicate(event);
      expect(result).toContain('Test Event');
      expect(result).toContain('2024-05-15');
    });

    it('should handle event with no title', () => {
      const event: calendar_v3.Schema$Event = {
        start: { date: '2024-05-15' },
      };

      const result = formatEventForDuplicate(event);
      expect(result).toContain('(No title)');
    });

    it('should handle event with dateTime', () => {
      const event: calendar_v3.Schema$Event = {
        summary: 'Test Event',
        start: { dateTime: '2024-05-15T10:00:00Z' },
      };

      const result = formatEventForDuplicate(event);
      expect(result).toContain('2024-05-15T10:00:00Z');
    });
  });
});

