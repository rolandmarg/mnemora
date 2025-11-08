import { describe, it, expect } from 'vitest';
import {
  sanitizeName,
  sanitizeNames,
  getFullName,
  capitalize,
  capitalizeWords,
  extractFirstName,
  extractLastName,
  extractNameParts,
  normalizeWhitespace,
  removePunctuation,
  isAlphaSpace,
  isValidName,
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

  describe('capitalize', () => {
    it('should capitalize first letter and lowercase rest', () => {
      expect(capitalize('john')).toBe('John');
      expect(capitalize('JOHN')).toBe('John');
      expect(capitalize('jOhN')).toBe('John');
    });

    it('should handle empty string', () => {
      expect(capitalize('')).toBe('');
    });

    it('should handle single character', () => {
      expect(capitalize('j')).toBe('J');
    });
  });

  describe('capitalizeWords', () => {
    it('should capitalize first letter of each word', () => {
      expect(capitalizeWords('john doe')).toBe('John Doe');
      expect(capitalizeWords('JOHN DOE')).toBe('John Doe');
      expect(capitalizeWords('jOhN dOe')).toBe('John Doe');
    });

    it('should handle multiple spaces', () => {
      expect(capitalizeWords('john   doe')).toBe('John Doe');
    });

    it('should handle empty string', () => {
      expect(capitalizeWords('')).toBe('');
    });

    it('should handle single word', () => {
      expect(capitalizeWords('john')).toBe('John');
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

  describe('normalizeWhitespace', () => {
    it('should collapse multiple spaces to single space', () => {
      expect(normalizeWhitespace('John    Doe')).toBe('John Doe');
      expect(normalizeWhitespace('John   Middle   Doe')).toBe('John Middle Doe');
    });

    it('should trim leading and trailing whitespace', () => {
      expect(normalizeWhitespace('  John Doe  ')).toBe('John Doe');
    });

    it('should handle tabs and newlines', () => {
      expect(normalizeWhitespace('John\tDoe\nSmith')).toBe('John Doe Smith');
    });

    it('should handle empty string', () => {
      expect(normalizeWhitespace('')).toBe('');
    });
  });

  describe('removePunctuation', () => {
    it('should remove all punctuation', () => {
      expect(removePunctuation('John, Doe!')).toBe('John Doe');
      expect(removePunctuation('O\'Brien-Smith')).toBe('OBrien-Smith');
    });

    it('should preserve letters, numbers, and spaces', () => {
      expect(removePunctuation('John Doe 123')).toBe('John Doe 123');
    });

    it('should handle empty string', () => {
      expect(removePunctuation('')).toBe('');
    });

    it('should remove various punctuation marks', () => {
      expect(removePunctuation('a.b,c;d:e!f?g\'h"i(j)k[l]m{n}o')).toBe('abcdefghijklmno');
    });
  });

  describe('isAlphaSpace', () => {
    it('should return true for strings with only letters and spaces', () => {
      expect(isAlphaSpace('John Doe')).toBe(true);
      expect(isAlphaSpace('John')).toBe(true);
      expect(isAlphaSpace('John Middle Doe')).toBe(true);
    });

    it('should return false for strings with numbers', () => {
      expect(isAlphaSpace('John123')).toBe(false);
      expect(isAlphaSpace('John Doe 123')).toBe(false);
    });

    it('should return false for strings with punctuation', () => {
      expect(isAlphaSpace('John-Doe')).toBe(false);
      expect(isAlphaSpace('John\'Doe')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isAlphaSpace('')).toBe(false);
    });
  });

  describe('isValidName', () => {
    it('should return true for valid names', () => {
      expect(isValidName('John Doe')).toBe(true);
      expect(isValidName('Mary-Jane')).toBe(true);
      expect(isValidName('O\'Brien')).toBe(true);
      expect(isValidName('John Middle Doe')).toBe(true);
    });

    it('should return false for names with numbers', () => {
      expect(isValidName('John123')).toBe(false);
      expect(isValidName('John Doe 123')).toBe(false);
    });

    it('should return false for names with invalid punctuation', () => {
      expect(isValidName('John.Doe')).toBe(false);
      expect(isValidName('John, Doe')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidName('')).toBe(false);
    });

    it('should allow hyphens and apostrophes', () => {
      expect(isValidName('Mary-Jane Watson')).toBe(true);
      expect(isValidName('O\'Brien Smith')).toBe(true);
    });
  });
});

