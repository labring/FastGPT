import { GET, POST, PUT, DELETE } from '@/api/request';
import { CreateQuestionGuideProps } from './type';

export const postQuestionGuide = (data: CreateQuestionGuideProps, cancelToken: AbortController) =>
  POST<string[]>('/core/ai/agent/createQuestionGuide', data, { cancelToken });
