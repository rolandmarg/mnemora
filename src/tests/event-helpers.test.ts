import { describe, it, expect } from 'vitest';
import { isRecurring, isAllDay, getEventStartDate, groupEvents, type Event } from '../utils/event-helpers.js';

describe('event-helpers', () => {
  describe('isRecurring', () => {
    it('should return true for recurring events', () => {
      const event: Event = {
        recurrence: ['RRULE:FREQ=YEARLY;INTERVAL=1'],
      };
      expect(isRecurring(event)).toBe(true);
    });

    it('should return false for non-recurring events', () => {
      const event: Event = {};
      expect(isRecurring(event)).toBe(false);
    });

    it('should return false for events with empty recurrence', () => {
      const event: Event = {
        recurrence: [],
      };
      expect(isRecurring(event)).toBe(false);
    });

    it('should return true for recurring event instances (with recurringEventId)', () => {
      const event: Event = {
        id: '8k4c9bgel6kjkvk759e0e23gco_20250129',
        recurringEventId: '8k4c9bgel6kjkvk759e0e23gco',
        summary: "Alejandro Villero's Birthday",
      };
      expect(isRecurring(event)).toBe(true);
    });
  });

  describe('isAllDay', () => {
    it('should return true for all-day events', () => {
      const event: Event = {
        start: { date: '2024-05-15' },
      };
      expect(isAllDay(event)).toBe(true);
    });

    it('should return false for events with dateTime', () => {
      const event: Event = {
        start: { dateTime: '2024-05-15T10:00:00Z' },
      };
      expect(isAllDay(event)).toBe(false);
    });

    it('should return false for events with no start', () => {
      const event: Event = {};
      expect(isAllDay(event)).toBe(false);
    });
  });

  describe('getEventStartDate', () => {
    it('should return date for all-day events', () => {
      const event: Event = {
        start: { date: '2024-05-15' },
      };
      expect(getEventStartDate(event)).toBe('2024-05-15');
    });

    it('should return dateTime for timed events', () => {
      const event: Event = {
        start: { dateTime: '2024-05-15T10:00:00Z' },
      };
      expect(getEventStartDate(event)).toBe('2024-05-15T10:00:00Z');
    });

    it('should return "(No date)" for events with no start', () => {
      const event: Event = {};
      expect(getEventStartDate(event)).toBe('(No date)');
    });
  });

  describe('groupEvents', () => {
    it('should group events by predicates', () => {
      const events: Event[] = [
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
      const event: Event = {
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

