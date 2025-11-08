import { describe, it, expect } from 'vitest';
import {
  sanitizeName,
  sanitizeNames,
  getFullName,
  extractFirstName,
  extractLastName,
  extractNameParts,
} from '../utils/name-helpers.js';

describe('name-helpers', () => {
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

  describe('getFullName', () => {
    it('should combine first and last name', () => {
      expect(getFullName('John', 'Doe')).toBe('John Doe');
    });

    it('should return only first name if no last name', () => {
      expect(getFullName('John')).toBe('John');
      expect(getFullName('John', undefined)).toBe('John');
    });

    it('should handle empty strings', () => {
      expect(getFullName('', '')).toBe('');
      expect(getFullName('John', '')).toBe('John');
      expect(getFullName('', 'Doe')).toBe(' Doe');
    });
  });

  describe('extractFirstName', () => {
    it('should extract first name from full name', () => {
      expect(extractFirstName('John Doe')).toBe('John');
      expect(extractFirstName('John Middle Doe')).toBe('John');
    });

    it('should handle single name', () => {
      expect(extractFirstName('John')).toBe('John');
    });

    it('should handle empty string', () => {
      expect(extractFirstName('')).toBe('');
    });

    it('should handle whitespace', () => {
      expect(extractFirstName('  John  Doe  ')).toBe('John');
    });
  });

  describe('extractLastName', () => {
    it('should extract last name from full name', () => {
      expect(extractLastName('John Doe')).toBe('Doe');
      expect(extractLastName('John Middle Doe')).toBe('Middle Doe');
    });

    it('should return empty string for single name', () => {
      expect(extractLastName('John')).toBe('');
    });

    it('should handle empty string', () => {
      expect(extractLastName('')).toBe('');
    });

    it('should handle whitespace', () => {
      expect(extractLastName('  John  Doe  ')).toBe('Doe');
    });
  });

  describe('extractNameParts', () => {
    it('should extract first and last name', () => {
      const result = extractNameParts('John Doe');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Doe');
    });

    it('should handle single name', () => {
      const result = extractNameParts('John');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBeUndefined();
    });

    it('should handle multiple middle names', () => {
      const result = extractNameParts('John Middle Last');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Middle Last');
    });

    it('should handle empty string', () => {
      const result = extractNameParts('');
      expect(result.firstName).toBe('');
      expect(result.lastName).toBeUndefined();
    });
  });

});

