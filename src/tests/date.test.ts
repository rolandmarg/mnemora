import { describe, it, expect } from 'vitest';
import {
  today,
  createDate,
  createDateFromMonthName,
  parseDateFromString,
  startOfDay,
  endOfDay,
  startOfYear,
  endOfYear,
  startOfMonth,
  endOfMonth,
  formatDateISO,
  formatDateShort,
  formatDateMonthYear,
  formatDateRange,
  isFirstDayOfMonth,
  fromDate,
} from '../utils/date-helpers.js';

describe('date utilities', () => {
  describe('today', () => {
    it('should return a Date object', () => {
      const result = today();
      expect(result).toBeInstanceOf(Date);
    });
  });

  describe('createDate', () => {
    it('should create a date with year, month, and day', () => {
      const date = createDate(5, 15, 2024);
      expect(date.getFullYear()).toBe(2024);
      expect(date.getMonth()).toBe(4); // May is month 4 (0-indexed)
      expect(date.getDate()).toBe(15);
    });

    it('should create a date without year (uses current year)', () => {
      const now = new Date();
      const date = createDate(5, 15);
      expect(date.getMonth()).toBe(4); // May is month 4
      expect(date.getDate()).toBe(15);
      expect(date.getFullYear()).toBe(now.getFullYear());
    });

    it('should handle month 12 (December)', () => {
      const date = createDate(12, 31, 2024);
      expect(date.getMonth()).toBe(11); // December is month 11
      expect(date.getDate()).toBe(31);
    });
  });

  describe('createDateFromMonthName', () => {
    it('should create a date from month name with year', () => {
      const date = createDateFromMonthName('May', 15, 2024);
      expect(date).not.toBeNull();
      expect(date?.getFullYear()).toBe(2024);
      expect(date?.getMonth()).toBe(4); // May is month 4
      expect(date?.getDate()).toBe(15);
    });

    it('should create a date from month name without year', () => {
      const now = new Date();
      const date = createDateFromMonthName('June', 1);
      expect(date).not.toBeNull();
      expect(date?.getMonth()).toBe(5); // June is month 5
      expect(date?.getFullYear()).toBe(now.getFullYear());
    });

    it('should handle abbreviated month names', () => {
      const date = createDateFromMonthName('Jan', 1, 2024);
      expect(date).not.toBeNull();
      expect(date?.getMonth()).toBe(0); // January is month 0
    });

    it('should return null for invalid month name', () => {
      const date = createDateFromMonthName('InvalidMonth', 1, 2024);
      expect(date).toBeNull();
    });

    it('should be case-insensitive', () => {
      const date1 = createDateFromMonthName('JANUARY', 1, 2024);
      const date2 = createDateFromMonthName('january', 1, 2024);
      const date3 = createDateFromMonthName('January', 1, 2024);
      expect(date1).not.toBeNull();
      expect(date2).not.toBeNull();
      expect(date3).not.toBeNull();
      expect(date1?.getTime()).toBe(date2?.getTime());
      expect(date1?.getTime()).toBe(date3?.getTime());
    });
  });

  describe('parseDateFromString', () => {
    it('should parse ISO date string', () => {
      // Use UTC date to avoid timezone issues
      const date = parseDateFromString('2024-05-15T00:00:00Z');
      expect(date.getUTCFullYear()).toBe(2024);
      expect(date.getUTCMonth()).toBe(4); // May is month 4
      expect(date.getUTCDate()).toBe(15);
    });

    it('should parse date string with time', () => {
      const date = parseDateFromString('2024-05-15T10:30:00Z');
      expect(date.getFullYear()).toBe(2024);
      expect(date.getMonth()).toBe(4);
    });

    it('should throw error for invalid date string', () => {
      expect(() => parseDateFromString('invalid-date')).toThrow('Invalid date string');
    });

    it('should throw error for empty string', () => {
      expect(() => parseDateFromString('')).toThrow('Invalid date string');
    });
  });

  describe('startOfDay', () => {
    it('should normalize date to start of day', () => {
      const date = new Date(2024, 4, 15, 14, 30, 45, 123);
      const result = startOfDay(date);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
      expect(result.getDate()).toBe(15);
    });

    it('should not modify original date', () => {
      const date = new Date(2024, 4, 15, 14, 30);
      const originalHours = date.getHours();
      startOfDay(date);
      expect(date.getHours()).toBe(originalHours);
    });
  });

  describe('endOfDay', () => {
    it('should normalize date to end of day', () => {
      const date = new Date(2024, 4, 15, 14, 30);
      const result = endOfDay(date);
      expect(result.getHours()).toBe(23);
      expect(result.getMinutes()).toBe(59);
      expect(result.getSeconds()).toBe(59);
      expect(result.getMilliseconds()).toBe(999);
      expect(result.getDate()).toBe(15);
    });
  });

  describe('startOfYear', () => {
    it('should return start of year', () => {
      const date = new Date(2024, 5, 15);
      const result = startOfYear(date);
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(0); // January
      expect(result.getDate()).toBe(1);
    });
  });

  describe('endOfYear', () => {
    it('should return end of year', () => {
      const date = new Date(2024, 5, 15);
      const result = endOfYear(date);
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(11); // December
      expect(result.getDate()).toBe(31);
      expect(result.getHours()).toBe(23);
      expect(result.getMinutes()).toBe(59);
      expect(result.getSeconds()).toBe(59);
    });
  });

  describe('startOfMonth', () => {
    it('should return start of month', () => {
      const date = new Date(2024, 4, 15);
      const result = startOfMonth(date);
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(4); // May
      expect(result.getDate()).toBe(1);
    });
  });

  describe('endOfMonth', () => {
    it('should return end of month', () => {
      const date = new Date(2024, 4, 15);
      const result = endOfMonth(date);
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(4); // May
      expect(result.getDate()).toBe(31);
    });

    it('should handle February correctly', () => {
      const date = new Date(2024, 1, 15); // February 15, 2024 (leap year)
      const result = endOfMonth(date);
      expect(result.getDate()).toBe(29);
    });
  });

  describe('formatDateISO', () => {
    it('should format date as YYYY-MM-DD', () => {
      const date = new Date(2024, 4, 15);
      const result = formatDateISO(date);
      expect(result).toBe('2024-05-15');
    });

    it('should pad single digit months and days', () => {
      const date = new Date(2024, 0, 5);
      const result = formatDateISO(date);
      expect(result).toBe('2024-01-05');
    });
  });

  describe('formatDateShort', () => {
    it('should format date without year', () => {
      const date = new Date(2024, 4, 15);
      const result = formatDateShort(date);
      expect(result).toMatch(/May 15/);
    });

    it('should format date with year when specified', () => {
      const date = new Date(2024, 4, 15);
      const result = formatDateShort(date, true);
      expect(result).toMatch(/May 15, 2024/);
    });
  });

  describe('formatDateMonthYear', () => {
    it('should format date as month and year', () => {
      const date = new Date(2024, 4, 15);
      const result = formatDateMonthYear(date);
      expect(result).toBe('May 2024');
    });
  });

  describe('formatDateRange', () => {
    it('should format date range', () => {
      const start = new Date(2024, 0, 1);
      const end = new Date(2024, 11, 31);
      const result = formatDateRange(start, end);
      expect(result).toContain('to');
    });
  });

  describe('isFirstDayOfMonth', () => {
    it('should return true for first day of month', () => {
      const date = new Date(2024, 4, 1);
      expect(isFirstDayOfMonth(date)).toBe(true);
    });

    it('should return false for other days', () => {
      const date = new Date(2024, 4, 15);
      expect(isFirstDayOfMonth(date)).toBe(false);
    });
  });

  describe('fromDate', () => {
    it('should create a new Date instance', () => {
      const original = new Date(2024, 4, 15);
      const result = fromDate(original);
      expect(result).not.toBe(original);
      expect(result.getTime()).toBe(original.getTime());
    });

    it('should not modify original date when result is modified', () => {
      const original = new Date(2024, 4, 15);
      const result = fromDate(original);
      result.setDate(20);
      expect(original.getDate()).toBe(15);
      expect(result.getDate()).toBe(20);
    });
  });
});

