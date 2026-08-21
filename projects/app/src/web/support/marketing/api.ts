import { POST } from '@/web/common/api/request';
import {
  type FetchWorkflowBody,
  type FetchWorkflowResponseType
} from '@/pages/api/support/marketing/fetchWorkflow';

export const postFetchWorkflow = (data: FetchWorkflowBody) =>
  POST<FetchWorkflowResponseType>('/support/marketing/fetchWorkflow', data);
