import type { DataSource, ReadOptions, WriteOptions, WriteResult, DeleteResult, DataSourceMetadata } from './data-source.interface.js';
import type { AppConfig } from '../config.js';

export abstract class BaseDataSource<T> implements DataSource<T> {
  protected readonly config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
  }

  abstract read(options?: ReadOptions): Promise<T[]>;

  async write(_data: T[], _options?: WriteOptions): Promise<WriteResult> {
    throw new Error(`Write operation not supported for ${this.getMetadata().type} data source`);
  }

  async delete(_id: string): Promise<boolean> {
    throw new Error(`Delete operation not supported for ${this.getMetadata().type} data source`);
  }

  async deleteAll(_options: ReadOptions): Promise<DeleteResult> {
    throw new Error(`DeleteAll operation not supported for ${this.getMetadata().type} data source`);
  }

  abstract isAvailable(): boolean;

  abstract getMetadata(): DataSourceMetadata;
}

