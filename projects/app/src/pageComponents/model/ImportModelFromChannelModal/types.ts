import type {
  ApplyChangesBody,
  ApplyChangesResponse,
  ImportPreviewItem,
  PreviewImportFromChannelResponse
} from '@fastgpt/global/openapi/core/ai/model/api';

export type ImportPreviewRow = PreviewImportFromChannelResponse['items'][number];
export type RowResult = {
  status: ApplyChangesResponse['results'][number]['status'];
  error?: string;
};
export type ChannelImportPlanRow = {
  providerModelSlug: string;
  category: ImportPreviewItem['category'];
  operation?: ApplyChangesBody['operations'][number];
};
export type ChannelImportPlan = { rows: ChannelImportPlanRow[] };
