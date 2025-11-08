/**
 * Architecture Types
 * 
 * Common types used across the architecture layer
 */

/**
 * Supported data source types
 */
export type DataSourceType = 'calendar' | 'sheets' | 'csv' | 'contacts';

/**
 * Supported output channel types
 */
export type OutputChannelType = 'console' | 'sms' | 'whatsapp' | 'email';

/**
 * Configuration for data source factory
 */
export interface DataSourceConfig {
  type: DataSourceType;
  [key: string]: unknown;
}

/**
 * Configuration for output channel factory
 */
export interface OutputChannelConfig {
  type: OutputChannelType;
  enabled?: boolean;
  [key: string]: unknown;
}

/**
 * Service configuration
 */
export interface ServiceConfig {
  dataSources: DataSourceConfig[];
  outputChannels: OutputChannelConfig[];
}

