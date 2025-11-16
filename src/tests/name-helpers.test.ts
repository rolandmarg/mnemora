import { describe, it, expect } from 'vitest';
import {
  sanitizeNames,
  getFullName,
  extractNameParts,
} from '../utils/name-helpers.util.js';

describe('name-helpers', () => {
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

