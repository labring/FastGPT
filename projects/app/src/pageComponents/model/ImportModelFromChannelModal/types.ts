import type {
  ImportFromChannelResponse,
  PreviewImportFromChannelResponse
} from '@fastgpt/global/openapi/core/ai/model/api';

export type ImportPreviewRow = PreviewImportFromChannelResponse['items'][number];
export type RowResult = {
  status: ImportFromChannelResponse['results'][number]['status'] | 'unknown';
  error?: string;
};
