import type {
  ApiDatasetDetailResponse,
  FeishuServer,
  YuqueServer
} from '@fastgpt/global/core/dataset/apiDataset/type';
import type {
  DeepRagSearchProps,
  SearchDatasetDataResponse
} from '../../core/dataset/search/controller';
import type { AuthOpenApiLimitProps } from '../../support/openapi/auth';
import type { CreateUsageProps, ConcatUsageProps } from '@fastgpt/global/support/wallet/usage/api';

declare global {
  var textCensorHandler: (params: { text: string }) => Promise<{ code: number; message?: string }>;
  var deepRagHandler: (data: DeepRagSearchProps) => Promise<SearchDatasetDataResponse>;
  var authOpenApiHandler: (data: AuthOpenApiLimitProps) => Promise<any>;
  var createUsageHandler: (data: CreateUsageProps) => any;
  var concatUsageHandler: (data: ConcatUsageProps) => any;
}
