import { GET, POST, PUT } from '@/web/common/api/request';
import type {
  GetModelStatusResponse,
  ModelStatusProbeConfigResponse,
  RunModelStatusProbeResponse,
  UpdateModelStatusProbeConfigBody,
  TestModelStatusWebhookBody,
  TestModelStatusWebhookResponse
} from '@fastgpt/global/openapi/admin/system/model/status';

const adminModelPath = '/admin/system/model';

export const getModelStatus = () => GET<GetModelStatusResponse>(adminModelPath + '/status');
export const putModelStatusProbeConfig = (data: UpdateModelStatusProbeConfigBody) =>
  PUT<ModelStatusProbeConfigResponse>(adminModelPath + '/status/config', data);
export const postModelStatusProbe = () =>
  POST<RunModelStatusProbeResponse>(adminModelPath + '/status/probe', {}, { timeout: 600000 });
export const postTestModelStatusWebhook = (data: TestModelStatusWebhookBody) =>
  POST<TestModelStatusWebhookResponse>(adminModelPath + '/status/testWebhook', data);
