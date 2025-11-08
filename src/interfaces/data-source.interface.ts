/**
 * Data Source Interface
 * 
 * Defines the contract for all data sources (Calendar, Sheets, etc.)
 * Any new data source must implement this interface.
 */

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

/**
 * Generic data source interface
 * 
 * @template T - The type of data items returned by this source
 */
export interface DataSource<T> {
  /**
   * Read data from the source
   * @param options - Optional parameters for reading (date ranges, filters, etc.)
   * @returns Promise resolving to an array of data items
   */
  read(options?: ReadOptions): Promise<T[]>;

  /**
   * Write data to the source (optional - not all sources support writing)
   * @param data - Array of data items to write
   * @param options - Optional parameters for writing
   * @returns Promise resolving to write result with counts
   * @throws Error if source doesn't support writing
   */
  write?(data: T[], options?: WriteOptions): Promise<WriteResult>;

  /**
   * Delete a single item from the source (optional - not all sources support deletion)
   * @param id - Identifier of the item to delete
   * @returns Promise resolving to true if deleted, false otherwise
   * @throws Error if source doesn't support deletion
   */
  delete?(id: string): Promise<boolean>;

  /**
   * Delete all items matching the given options (optional - not all sources support deletion)
   * @param options - Options for filtering what to delete (e.g., date range)
   * @returns Promise resolving to deletion result with counts
   * @throws Error if source doesn't support deletion
   */
  deleteAll?(options: ReadOptions): Promise<DeleteResult>;

  /**
   * Check if the data source is available and properly configured
   * @returns true if source is available, false otherwise
   */
  isAvailable(): boolean;

  /**
   * Get metadata about this data source
   * @returns Metadata object describing the source
   */
  getMetadata(): DataSourceMetadata;
}

