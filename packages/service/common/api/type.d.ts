import { FeishuServer, YuqueServer } from '@fastgpt/global/core/dataset/apiDataset';
import {
  DeepRagSearchProps,
  SearchDatasetDataResponse
} from '../../core/dataset/search/controller';
import { AuthOpenApiLimitProps } from '../../support/openapi/auth';
import { CreateUsageProps, ConcatUsageProps } from '@fastgpt/global/support/wallet/usage/api';
import {
  GetProApiDatasetFileContentParams,
  GetProApiDatasetFileListParams,
  GetProApiDatasetFilePreviewUrlParams
} from '../../core/dataset/apiDataset/proApi';

declare global {
  var textCensorHandler: (params: { text: string }) => Promise<{ code: number; message?: string }>;
  var deepRagHandler: (data: DeepRagSearchProps) => Promise<SearchDatasetDataResponse>;
  var authOpenApiHandler: (data: AuthOpenApiLimitProps) => Promise<any>;
  var createUsageHandler: (data: CreateUsageProps) => Promise<void>;
  var concatUsageHandler: (data: ConcatUsageProps) => Promise<void>;

  // API dataset
  var getProApiDatasetFileList: (data: GetProApiDatasetFileListParams) => Promise<APIFileItem[]>;
  var getProApiDatasetFileContent: (
    data: GetProApiDatasetFileContentParams
  ) => Promise<ApiFileReadContentResponse>;
  var getProApiDatasetFilePreviewUrl: (
    data: GetProApiDatasetFilePreviewUrlParams
  ) => Promise<string>;
}
