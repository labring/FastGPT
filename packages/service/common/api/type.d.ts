import type { ApiDatasetDetailResponse } from '@fastgpt/global/core/dataset/apiDataset';
import { FeishuServer, YuqueServer } from '@fastgpt/global/core/dataset/apiDataset';
import type {
  DeepRagSearchProps,
  SearchDatasetDataResponse
} from '../../core/dataset/search/controller';
import type { AuthOpenApiLimitProps } from '../../support/openapi/auth';
import type { CreateUsageProps, ConcatUsageProps } from '@fastgpt/global/support/wallet/usage/api';
import type {
  GetProApiDatasetFileContentParams,
  GetProApiDatasetFileDetailParams,
  GetProApiDatasetFileListParams,
  GetProApiDatasetFilePreviewUrlParams
} from '../../core/dataset/apiDataset/proApi';

declare global {
  var textCensorHandler: (params: { text: string }) => Promise<{ code: number; message?: string }>;
  var deepRagHandler: (data: DeepRagSearchProps) => Promise<SearchDatasetDataResponse>;
  var authOpenApiHandler: (data: AuthOpenApiLimitProps) => Promise<any>;
  var createUsageHandler: (data: CreateUsageProps) => any;
  var concatUsageHandler: (data: ConcatUsageProps) => any;

  // API dataset
  var getProApiDatasetFileList: (data: GetProApiDatasetFileListParams) => Promise<APIFileItem[]>;
  var getProApiDatasetFileContent: (
    data: GetProApiDatasetFileContentParams
  ) => Promise<ApiFileReadContentResponse>;
  var getProApiDatasetFilePreviewUrl: (
    data: GetProApiDatasetFilePreviewUrlParams
  ) => Promise<string>;
  var getProApiDatasetFileDetail: (
    data: GetProApiDatasetFileDetailParams
  ) => Promise<ApiDatasetDetailResponse>;
}
