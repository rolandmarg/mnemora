/**
 * Name helper utilities for sanitization and string manipulation
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

/**
 * Get full name from first and last name
 */
export function getFullName(firstName: string, lastName?: string): string {
  return lastName ? `${firstName} ${lastName}` : firstName;
}

/**
 * Extract first name from a full name string
 */
function extractFirstName(fullName: string): string {
  if (!fullName) {
    return '';
  }
  const parts = fullName.trim().split(/\s+/);
  return parts[0] ?? '';
}

/**
 * Extract last name from a full name string
 */
function extractLastName(fullName: string): string {
  if (!fullName) {
    return '';
  }
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) {
    return '';
  }
  return parts.slice(1).join(' ');
}

/**
 * Extract first and last name from a full name string
 */
export function extractNameParts(fullName: string): { firstName: string; lastName?: string } {
  const firstName = extractFirstName(fullName);
  const lastName = extractLastName(fullName);
  return {
    firstName,
    lastName: lastName || undefined,
  };
}


