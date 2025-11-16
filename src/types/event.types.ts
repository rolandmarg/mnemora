export interface Event {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: {
    date?: string;
    dateTime?: string;
    timeZone?: string;
  };
  end?: {
    date?: string;
    dateTime?: string;
    timeZone?: string;
  };
  recurrence?: string[];
  recurringEventId?: string;
}

export interface DeletionResult {
  deletedCount: number;
  skippedCount: number;
  errorCount: number;
}

