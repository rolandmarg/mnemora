import { randomUUID } from 'node:crypto';

const correlationStorage = new Map<string, string>();

function getStoredCorrelationId(): string | undefined {
  return correlationStorage.get('correlationId');
}

function setStoredCorrelationId(id: string): void {
  correlationStorage.set('correlationId', id);
}

function generateCorrelationId(): string {
  return randomUUID();
}

export function getCorrelationId(): string | undefined {
  return getStoredCorrelationId();
}

export function setCorrelationId(id: string): void {
  setStoredCorrelationId(id);
}

export function initializeCorrelationId(): string {
  const existing = getStoredCorrelationId();
  if (existing) {
    return existing;
  }

  const newId = generateCorrelationId();
  setStoredCorrelationId(newId);
  return newId;
}
