import { describe, it, expect } from 'vitest';
import type { CalendarEvent } from '../calendar/types.js';
import { isRecurring, isAllDay, getEventStartDate, groupEvents } from '../calendar/event-helpers.js';

describe('event-helpers', () => {
  describe('isRecurring', () => {
    it('should return true for recurring events', () => {
      const event: CalendarEvent = {
        recurrence: ['RRULE:FREQ=YEARLY;INTERVAL=1'],
      };
      expect(isRecurring(event)).toBe(true);
    });

    it('should return false for non-recurring events', () => {
      const event: CalendarEvent = {};
      expect(isRecurring(event)).toBe(false);
    });

    it('should return false for events with empty recurrence', () => {
      const event: CalendarEvent = {
        recurrence: [],
      };
      expect(isRecurring(event)).toBe(false);
    });
  });

  describe('isAllDay', () => {
    it('should return true for all-day events', () => {
      const event: CalendarEvent = {
        start: { date: '2024-05-15' },
      };
      expect(isAllDay(event)).toBe(true);
    });

    it('should return false for events with dateTime', () => {
      const event: CalendarEvent = {
        start: { dateTime: '2024-05-15T10:00:00Z' },
      };
      expect(isAllDay(event)).toBe(false);
    });

    it('should return false for events with no start', () => {
      const event: CalendarEvent = {};
      expect(isAllDay(event)).toBe(false);
    });
  });

  describe('getEventStartDate', () => {
    it('should return date for all-day events', () => {
      const event: CalendarEvent = {
        start: { date: '2024-05-15' },
      };
      expect(getEventStartDate(event)).toBe('2024-05-15');
    });

    it('should return dateTime for timed events', () => {
      const event: CalendarEvent = {
        start: { dateTime: '2024-05-15T10:00:00Z' },
      };
      expect(getEventStartDate(event)).toBe('2024-05-15T10:00:00Z');
    });

    it('should return "(No date)" for events with no start', () => {
      const event: CalendarEvent = {};
      expect(getEventStartDate(event)).toBe('(No date)');
    });
  });

  describe('groupEvents', () => {
    it('should group events by predicates', () => {
      const events: CalendarEvent[] = [
        { summary: 'Event 1', recurrence: ['RRULE:FREQ=YEARLY'] },
        { summary: 'Event 2', start: { date: '2024-05-15' } },
        { summary: 'Event 3' },
      ];

      const groups = groupEvents(events, [
        { name: 'recurring', test: isRecurring },
        { name: 'allDay', test: isAllDay },
      ]);

      expect(groups.recurring).toHaveLength(1);
      expect(groups.allDay).toHaveLength(1);
      expect(groups.other).toHaveLength(1);
    });

    it('should handle empty events array', () => {
      const groups = groupEvents([], [
        { name: 'recurring', test: isRecurring },
      ]);
      expect(groups.recurring).toHaveLength(0);
      expect(groups.other).toBeUndefined();
    });

    it('should handle events matching multiple predicates (first match wins)', () => {
      const event: CalendarEvent = {
        summary: 'Event',
        recurrence: ['RRULE:FREQ=YEARLY'],
        start: { date: '2024-05-15' },
      };

      const groups = groupEvents([event], [
        { name: 'recurring', test: isRecurring },
        { name: 'allDay', test: isAllDay },
      ]);

      expect(groups.recurring).toHaveLength(1);
      expect(groups.allDay).toHaveLength(0);
    });
  });
});

