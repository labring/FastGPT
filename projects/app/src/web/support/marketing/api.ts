import { POST } from '@/web/common/api/request';
import {
  FetchWorkflowQuery,
  FetchWorkflowResponseType
} from '@/pages/api/support/marketing/fetchWorkflow';

export const postFetchWorkflow = (data: FetchWorkflowQuery) =>
  POST<FetchWorkflowResponseType>('/support/marketing/fetchWorkflow', data);
