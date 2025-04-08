import { FeishuServer, YuqueServer } from '@fastgpt/global/core/dataset/apiDataset';
import {
  DeepRagSearchProps,
  SearchDatasetDataResponse
} from '../../core/dataset/search/controller';
import { AuthOpenApiLimitProps } from '../../support/openapi/auth';
import { CreateUsageProps, ConcatUsageProps } from '@fastgpt/global/support/wallet/usage/api';

declare global {
  var systemApiDatasetHandler: (params: {
    type: 'content';
    feishuServer?: FeishuServer;
    yuqueServer?: YuqueServer;
    apiFileId: string;
  }) => Promise<{
    title?: string;
    rawText: string;
  }>;
  var textCensorHandler: (params: { text: string }) => Promise<{ code?: number; message: string }>;
  var deepRagHandler: (data: DeepRagSearchProps) => Promise<SearchDatasetDataResponse>;
  var authOpenApiHandler: (data: AuthOpenApiLimitProps) => Promise<AuthOpenApiLimitProps>;
  var createUsageHandler: (data: CreateUsageProps) => Promise<void>;
  var concatUsageHandler: (data: ConcatUsageProps) => Promise<void>;
}
