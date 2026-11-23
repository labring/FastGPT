import type {
  ApplyChangesBody,
  ApplyChangesResponse,
  PreviewImportFromChannelResponse
} from '@fastgpt/global/openapi/core/ai/model/api';

export type ImportPreviewRow = PreviewImportFromChannelResponse['items'][number];
export type RowResult = {
  status: ApplyChangesResponse['results'][number]['status'] | 'unknown';
  error?: string;
};
export type ChannelImportPlanRow = {
  providerModelSlug: string;
  operation?: ApplyChangesBody['operations'][number];
};
export type ChannelImportPlan = { rows: ChannelImportPlanRow[] };
