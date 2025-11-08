/**
 * Base Data Source
 * 
 * Abstract base class for all data sources
 * Provides common functionality and enforces interface implementation
 */

import type { DataSource, ReadOptions, WriteOptions, WriteResult, DeleteResult, DataSourceMetadata } from '../interfaces/data-source.interface.js';
import type { AppConfig } from '../config.js';

/**
 * Abstract base class for data sources
 * 
 * Provides common functionality and enforces interface implementation
 * All data sources should extend this class
 * 
 * @template T - The type of data items returned by this source
 */
export abstract class BaseDataSource<T> implements DataSource<T> {
  protected readonly config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
  }

  /**
   * Read data from the source
   * Must be implemented by subclasses
   */
  abstract read(options?: ReadOptions): Promise<T[]>;

  /**
   * Write data to the source (optional - not all sources support writing)
   * Default implementation throws error
   * Override in subclasses that support writing
   */
  async write(_data: T[], _options?: WriteOptions): Promise<WriteResult> {
    throw new Error(`Write operation not supported for ${this.getMetadata().type} data source`);
  }

  /**
   * Delete a single item from the source (optional - not all sources support deletion)
   * Default implementation throws error
   * Override in subclasses that support deletion
   */
  async delete(_id: string): Promise<boolean> {
    throw new Error(`Delete operation not supported for ${this.getMetadata().type} data source`);
  }

  /**
   * Delete all items matching the given options (optional - not all sources support deletion)
   * Default implementation throws error
   * Override in subclasses that support deletion
   */
  async deleteAll(_options: ReadOptions): Promise<DeleteResult> {
    throw new Error(`DeleteAll operation not supported for ${this.getMetadata().type} data source`);
  }

  /**
   * Check if the data source is available and properly configured
   * Must be implemented by subclasses
   */
  abstract isAvailable(): boolean;

  /**
   * Get metadata about this data source
   * Must be implemented by subclasses
   */
  abstract getMetadata(): DataSourceMetadata;
}

