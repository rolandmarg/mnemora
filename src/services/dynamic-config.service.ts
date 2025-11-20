import ssmClient from '../clients/ssm.client.js';
import { config } from '../config.js';
import type { Logger } from '../types/logger.types.js';

interface CachedParameter {
  value: string;
  timestamp: number;
}

class DynamicConfigService {
  private readonly cache: Map<string, CachedParameter> = new Map();
  private readonly cacheTTL: number = 5 * 60 * 1000; // 5 minutes
  private readonly environment: string;
  private readonly basePath: string;
  private readonly logger?: Logger;

  constructor(logger?: Logger) {
    this.environment = config.environment === 'production' ? 'prod' : 'dev';
    this.basePath = `/mnemora/${this.environment}`;
    this.logger = logger;
  }

  private getParameterPath(category: string, parameter: string): string {
    return `${this.basePath}/${category}/${parameter}`;
  }

  private isCacheValid(cached: CachedParameter): boolean {
    const now = Date.now();
    return (now - cached.timestamp) < this.cacheTTL;
  }

  private async fetchParameter(name: string): Promise<string | null> {
    if (!ssmClient.isAvailable()) {
      this.logger?.warn('SSM client not available, cannot fetch parameter', { parameter: name });
      return null;
    }

    try {
      const value = await ssmClient.getParameter(name);
      if (value !== null) {
        // Cache the value
        this.cache.set(name, {
          value,
          timestamp: Date.now(),
        });
      }
      return value;
    } catch (error) {
      this.logger?.error('Error fetching parameter from Parameter Store', error, { parameter: name });
      return null;
    }
  }

  private async fetchParameters(names: string[]): Promise<Record<string, string>> {
    if (!ssmClient.isAvailable()) {
      this.logger?.warn('SSM client not available, cannot fetch parameters', { parameters: names });
      return {};
    }

    try {
      const values = await ssmClient.getParameters(names);
      
      // Cache all fetched values
      const cacheTimestamp = Date.now();
      for (const [name, value] of Object.entries(values)) {
        this.cache.set(name, {
          value,
          timestamp: cacheTimestamp,
        });
      }

      return values;
    } catch (error) {
      this.logger?.error('Error fetching parameters from Parameter Store', error, { parameters: names });
      return {};
    }
  }

  async getParameter(category: string, parameter: string): Promise<string | null> {
    const fullPath = this.getParameterPath(category, parameter);
    
    // Check cache first
    const cached = this.cache.get(fullPath);
    if (cached && this.isCacheValid(cached)) {
      return cached.value;
    }

    // Fetch from Parameter Store
    return await this.fetchParameter(fullPath);
  }

  async getParameters(categories: Record<string, string[]>): Promise<Record<string, string | null>> {
    // Build list of all parameter paths
    const parameterPaths: string[] = [];
    const pathToKey: Map<string, string> = new Map();

    for (const [category, params] of Object.entries(categories)) {
      for (const param of params) {
        const fullPath = this.getParameterPath(category, param);
        parameterPaths.push(fullPath);
        pathToKey.set(fullPath, `${category}.${param}`);
      }
    }

    // Check cache for all parameters
    const cached: Record<string, string | null> = {};
    const toFetch: string[] = [];

    for (const path of parameterPaths) {
      const cachedValue = this.cache.get(path);
      if (cachedValue && this.isCacheValid(cachedValue)) {
        const key = pathToKey.get(path) ?? path;
        cached[key] = cachedValue.value;
      } else {
        toFetch.push(path);
      }
    }

    // Fetch missing parameters
    if (toFetch.length > 0) {
      const fetched = await this.fetchParameters(toFetch);
      
      // Add fetched values to result
      for (const [path, value] of Object.entries(fetched)) {
        const key = pathToKey.get(path) ?? path;
        cached[key] = value;
      }

      // Add null for parameters that weren't found
      for (const path of toFetch) {
        if (!(path in fetched)) {
          const key = pathToKey.get(path) ?? path;
          if (!(key in cached)) {
            cached[key] = null;
          }
        }
      }
    }

    return cached;
  }

  clearCache(): void {
    this.cache.clear();
  }

  clearCacheForParameter(category: string, parameter: string): void {
    const fullPath = this.getParameterPath(category, parameter);
    this.cache.delete(fullPath);
  }
}

export { DynamicConfigService };

