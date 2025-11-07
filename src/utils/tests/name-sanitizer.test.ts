import { describe, it, expect } from 'vitest';
import { sanitizeName, sanitizeNames } from '../name-sanitizer.js';

describe('name-sanitizer', () => {
  describe('sanitizeName', () => {
    it('should remove trailing dots', () => {
      expect(sanitizeName('John.')).toBe('John');
      expect(sanitizeName('Alyssa S.')).toBe('Alyssa S');
    });

    it('should remove trailing commas', () => {
      expect(sanitizeName('John,')).toBe('John');
    });

    it('should remove trailing semicolons', () => {
      expect(sanitizeName('John;')).toBe('John');
    });

    it('should remove trailing colons', () => {
      expect(sanitizeName('John:')).toBe('John');
    });

    it('should remove trailing exclamation marks', () => {
      expect(sanitizeName('John!')).toBe('John');
    });

    it('should remove trailing question marks', () => {
      expect(sanitizeName('John?')).toBe('John');
    });

    it('should remove multiple trailing punctuation', () => {
      expect(sanitizeName('John...')).toBe('John');
      expect(sanitizeName('John!!!')).toBe('John');
    });

    it('should remove leading and trailing whitespace', () => {
      expect(sanitizeName('  John  ')).toBe('John');
      expect(sanitizeName('  John Doe  ')).toBe('John Doe');
    });

    it('should collapse multiple spaces', () => {
      expect(sanitizeName('John    Doe')).toBe('John Doe');
      expect(sanitizeName('John   Middle   Doe')).toBe('John Middle Doe');
    });

    it('should handle empty string', () => {
      expect(sanitizeName('')).toBe('');
    });

    it('should handle string with only whitespace', () => {
      expect(sanitizeName('   ')).toBe('');
    });

    it('should not remove punctuation in the middle', () => {
      expect(sanitizeName('O\'Brien')).toBe('O\'Brien');
      expect(sanitizeName('Mary-Jane')).toBe('Mary-Jane');
    });

    it('should handle names with no punctuation', () => {
      expect(sanitizeName('John Doe')).toBe('John Doe');
    });
  });

  describe('sanitizeNames', () => {
    it('should sanitize first and last name', () => {
      const result = sanitizeNames('John.', 'Doe.');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Doe');
    });

    it('should handle only first name', () => {
      const result = sanitizeNames('John.');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBeUndefined();
    });

    it('should handle empty last name', () => {
      const result = sanitizeNames('John', '');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBeUndefined();
    });

    it('should handle whitespace in names', () => {
      const result = sanitizeNames('  John  ', '  Doe  ');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Doe');
    });

    it('should handle multiple spaces in names', () => {
      const result = sanitizeNames('John   Middle', 'Doe   Last');
      expect(result.firstName).toBe('John Middle');
      expect(result.lastName).toBe('Doe Last');
    });
  });
});

