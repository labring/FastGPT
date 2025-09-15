import type { CalculateMethodEnum } from '../constants';

// ===== Common Types =====

export interface MetricConfigItem {
  metricId: string;
  thresholdValue?: number;
  weight?: number;
  calculateType?: CalculateMethodEnum;
}

export interface MetricConfigItemWithName extends Omit<MetricConfigItem, 'calculateType'> {
  weight: number; // Required in config responses
  metricName: string; // Metric name for display
}

export interface UpdateMetricConfigItem extends Omit<MetricConfigItem, 'calculateType'> {
  metricId: string;
  thresholdValue?: number;
  weight?: number;
}

// ===== Config API Types =====

export interface UpdateSummaryConfigBody {
  evalId: string;
  calculateType?: CalculateMethodEnum;
  metricsConfig: UpdateMetricConfigItem[];
}

export interface UpdateSummaryConfigResponse {
  message: string;
}

// ===== Config Detail API Types =====

export interface GetConfigDetailQuery {
  evalId: string;
}

export interface GetConfigDetailResponse {
  calculateType: CalculateMethodEnum;
  calculateTypeName: string;
  metricsConfig: MetricConfigItemWithName[];
}

// ===== Summary Detail API Types =====

export interface GetEvaluationSummaryQuery {
  evalId: string;
}

export interface EvaluationSummaryResponse {
  data: Array<{
    metricId: string;
    metricName: string;
    metricScore: number;
    summary: string;
    summaryStatus: string;
    errorReason?: string;
    completedItemCount: number;
    overThresholdItemCount: number;
    thresholdPassRate: number;
    threshold: number;
    customSummary: string;
  }>;
  aggregateScore: number;
}

// ===== Generate Summary API Types =====
// Note: GenerateSummaryParams and GenerateSummaryResponse are already defined in ../type.d.ts
