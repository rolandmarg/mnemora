import { describe, it, expect } from 'vitest';
import { parseInput } from '../utils/birthday-helpers.js';

describe('birthday-parser', () => {
  describe('parseInput', () => {
    describe('ISO date format (YYYY-MM-DD)', () => {
      it('should parse "John Doe 1990-05-15"', () => {
        const result = parseInput('John Doe 1990-05-15');
        expect(result).not.toBeNull();
        expect(result?.firstName).toBe('John');
        expect(result?.lastName).toBe('Doe');
        expect(result?.year).toBe(1990);
        expect(result?.birthday.getMonth()).toBe(4); // May is month 4
        expect(result?.birthday.getDate()).toBe(15);
      });

      it('should parse "John 1990-05-15" (no last name)', () => {
        const result = parseInput('John 1990-05-15');
        expect(result).not.toBeNull();
        expect(result?.firstName).toBe('John');
        expect(result?.lastName).toBeUndefined();
        expect(result?.year).toBe(1990);
      });
    });

    describe('ISO date format (MM-DD)', () => {
      it('should parse "John Doe 05-15"', () => {
        const result = parseInput('John Doe 05-15');
        expect(result).not.toBeNull();
        expect(result?.firstName).toBe('John');
        expect(result?.lastName).toBe('Doe');
        expect(result?.year).toBeUndefined();
        expect(result?.birthday.getMonth()).toBe(4); // May is month 4
        expect(result?.birthday.getDate()).toBe(15);
      });

      it('should parse "John 05-15" (no last name)', () => {
        const result = parseInput('John 05-15');
        expect(result).not.toBeNull();
        expect(result?.firstName).toBe('John');
        expect(result?.lastName).toBeUndefined();
      });
    });

    describe('Month name format (Month DD, YYYY)', () => {
      it('should parse "John Doe May 15, 1990"', () => {
        const result = parseInput('John Doe May 15, 1990');
        expect(result).not.toBeNull();
        expect(result?.firstName).toBe('John');
        expect(result?.lastName).toBe('Doe');
        expect(result?.year).toBe(1990);
        expect(result?.birthday.getMonth()).toBe(4); // May is month 4
        expect(result?.birthday.getDate()).toBe(15);
      });

      it('should parse "John May 15, 1990" (no last name)', () => {
        const result = parseInput('John May 15, 1990');
        expect(result).not.toBeNull();
        expect(result?.firstName).toBe('John');
        expect(result?.lastName).toBeUndefined();
      });
    });

    describe('Month name format (Month DD)', () => {
      it('should parse "John Doe May 15"', () => {
        const result = parseInput('John Doe May 15');
        expect(result).not.toBeNull();
        expect(result?.firstName).toBe('John');
        expect(result?.lastName).toBe('Doe');
        expect(result?.year).toBeUndefined();
        expect(result?.birthday.getMonth()).toBe(4); // May is month 4
        expect(result?.birthday.getDate()).toBe(15);
      });
    });

    describe('Name sanitization', () => {
      it('should sanitize names with trailing dots', () => {
        const result = parseInput('Alyssa S. 05-22');
        expect(result).not.toBeNull();
        expect(result?.firstName).toBe('Alyssa');
        expect(result?.lastName).toBe('S');
      });

      it('should sanitize names with trailing punctuation', () => {
        const result = parseInput('John. Doe. 05-15');
        expect(result).not.toBeNull();
        expect(result?.firstName).toBe('John');
        expect(result?.lastName).toBe('Doe');
      });
    });

    describe('Edge cases', () => {
      it('should return null for invalid input', () => {
        expect(parseInput('invalid')).toBeNull();
        expect(parseInput('')).toBeNull();
        expect(parseInput('John')).toBeNull();
      });

      it('should handle names with multiple words', () => {
        const result = parseInput('Mary Jane Watson 05-15');
        expect(result).not.toBeNull();
        expect(result?.firstName).toBe('Mary');
        expect(result?.lastName).toBe('Jane Watson');
      });

      it('should handle abbreviated month names', () => {
        const result = parseInput('John Jan 15, 2024');
        expect(result).not.toBeNull();
        expect(result?.birthday.getMonth()).toBe(0); // January is month 0
      });

      it('should handle full month names', () => {
        const result = parseInput('John January 15, 2024');
        expect(result).not.toBeNull();
        expect(result?.birthday.getMonth()).toBe(0);
      });
    });
  });
});

