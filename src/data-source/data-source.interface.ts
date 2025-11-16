export interface ReadOptions {
  startDate?: Date;
  endDate?: Date;
  filters?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface WriteOptions {
  overwrite?: boolean;
  append?: boolean;
  [key: string]: unknown;
}

export interface WriteResult {
  added: number;
  skipped: number;
  errors: number;
}

export interface DeleteResult {
  deletedCount: number;
  skippedCount: number;
  errorCount: number;
}

export interface DataSourceMetadata {
  name: string;
  type: string;
  description: string;
  supportsRead: boolean;
  supportsWrite: boolean;
  capabilities: string[];
}

export interface DataSource<T> {
  read(options?: ReadOptions): Promise<T[]>;
  write?(data: T[], options?: WriteOptions): Promise<WriteResult>;
  delete?(id: string): Promise<boolean>;
  deleteAll?(options: ReadOptions): Promise<DeleteResult>;
  isAvailable(): boolean;
  getMetadata(): DataSourceMetadata;
}

