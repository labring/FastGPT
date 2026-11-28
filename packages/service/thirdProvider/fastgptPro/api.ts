import type { AxiosRequestConfig, Method } from 'axios';
import {
  AdminDatasetTrainingEnhanceResponseSchema,
  type AdminDatasetTrainingEnhanceBody,
  type AdminLlmParagraphBody,
  type AdminLlmParagraphResponse
} from '@fastgpt/global/openapi/admin/dataset/training/api';
import type {
  ConcatUsageProps,
  CreateUsageProps,
  PushUsageItemsProps
} from '@fastgpt/global/support/wallet/usage/api';
import type { SendInform2UserProps } from '@fastgpt/global/support/user/inform/type';
import { POST, plusRequest } from './plusRequest';
import type { ProHealthResponse } from '@fastgpt/global/openapi/common/system/api';

export type FastGPTProOutLinkRequest = {
  token: string;
  method?: string;
  params?: AxiosRequestConfig['params'];
  data?: unknown;
  headers?: AxiosRequestConfig['headers'];
};

export type CreateParagraphTitleRequest = Omit<AdminLlmParagraphBody, 'modelId'> & {
  modelId?: string;
};

export const postCreateUsage = (data: CreateUsageProps) =>
  POST<string>('/support/wallet/usage/createUsage', data);

export const postConcatUsage = (data: ConcatUsageProps) =>
  POST('/support/wallet/usage/concatUsage', data);

export const postPushUsageItems = (data: PushUsageItemsProps) =>
  POST('/support/wallet/usage/pushUsageItems', data);

export const postHealth = (config?: { timeout?: number }) =>
  POST<ProHealthResponse>('/health', {}, config);

export const postSendInform = (data: SendInform2UserProps) =>
  POST('/support/user/inform/create', data);

export const postCreateParagraphTitle = (data: CreateParagraphTitleRequest) =>
  POST<AdminLlmParagraphResponse>('/core/dataset/training/llmPargraph', data, {
    timeout: 600000
  });

/** 计算当前文档分块的增强结果，服务异常与成功返回的 skipped 分开处理。 */
export const postDatasetTrainingEnhance = async (data: AdminDatasetTrainingEnhanceBody) =>
  AdminDatasetTrainingEnhanceResponseSchema.parse(
    await POST<unknown>('/core/dataset/training/enhance', data, { timeout: 600000 })
  );

const forwardOutLink = ({
  path,
  token,
  method,
  params,
  data,
  headers
}: FastGPTProOutLinkRequest & { path: string }) =>
  plusRequest({
    method: method as Method,
    url: `${path}/${token}`,
    params,
    data,
    headers
  });

export const forwardOffiaccount = (request: FastGPTProOutLinkRequest) =>
  forwardOutLink({ ...request, path: 'support/outLink/offiaccount' });

export const forwardWecom = (request: FastGPTProOutLinkRequest) =>
  forwardOutLink({ ...request, path: 'support/outLink/wecom' });

export const postForwardFeishu = ({ token, data, headers }: FastGPTProOutLinkRequest) =>
  POST(`/support/outLink/feishu/${token}`, data as any, { headers });

export const postForwardDingtalk = ({ token, data, headers }: FastGPTProOutLinkRequest) =>
  POST(`/support/outLink/dingtalk/${token}`, data as any, { headers });
