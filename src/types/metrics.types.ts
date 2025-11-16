export type MetricUnit = 'Count' | 'Milliseconds' | 'Bytes' | 'Percent' | 'None';

export interface MetricDataPoint {
  name: string;
  value: number;
  unit: MetricUnit;
  timestamp?: Date;
  dimensions?: Record<string, string>;
}

