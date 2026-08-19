import { POST } from '@/web/common/api/request';
import type {
  FetchWorkflowBodyType,
  FetchWorkflowResponseType
} from '@fastgpt/global/openapi/common/other/api';

export const postFetchWorkflow = (data: FetchWorkflowBodyType) =>
  POST<FetchWorkflowResponseType>('/support/marketing/fetchWorkflow', data);
