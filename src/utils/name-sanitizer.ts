/**
 * Name sanitization utilities
 */

/**
 * Sanitize a name by removing trailing whitespace, dots, and other invalid characters
 */
export function sanitizeName(name: string): string {
  if (!name) {
    return '';
  }
  
  // Remove leading/trailing whitespace
  let sanitized = name.trim();
  
  // Remove trailing dots, commas, and other punctuation
  sanitized = sanitized.replace(/[.,;:!?]+$/, '');
  
  // Remove any trailing whitespace again (in case punctuation left some)
  sanitized = sanitized.trim();
  
  // Remove multiple spaces and replace with single space
  sanitized = sanitized.replace(/\s+/g, ' ');
  
  return sanitized;
}

/**
 * Sanitize first and last name
 */
export function sanitizeNames(firstName: string, lastName?: string): { firstName: string; lastName?: string } {
  const sanitizedFirstName = sanitizeName(firstName);
  const sanitizedLastName = lastName ? sanitizeName(lastName) : undefined;
  
  return {
    firstName: sanitizedFirstName,
    lastName: sanitizedLastName ?? undefined,
  };
}

