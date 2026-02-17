import { GET, POST } from '@/web/common/api/request';
import type {
  ListSkillResponseType,
  DetailSkillResponseType,
  CreateSkillAppBodyType,
  CreateSkillAppResponseType
} from '@fastgpt/global/openapi/core/app/skill/api';

export const getSkillList = () => GET<ListSkillResponseType>('/core/app/skill/list');

export const getSkillDetail = (skillId: string) =>
  GET<DetailSkillResponseType>(`/core/app/skill/detail?skillId=${skillId}`);

export const postCreateSkillApp = (data: CreateSkillAppBodyType) =>
  POST<CreateSkillAppResponseType>('/core/app/skill/create', data);
