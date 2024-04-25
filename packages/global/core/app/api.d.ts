import type { LLMModelItemType } from '../ai/model.d';
import { AppTypeEnum } from './constants';
import { AppSchema } from './type';

export type CreateAppParams = {
  name?: string;
  avatar?: string;
  type?: `${AppTypeEnum}`;
  modules: AppSchema['modules'];
  edges?: AppSchema['edges'];
};

export interface AppUpdateParams {
  name?: string;
  type?: `${AppTypeEnum}`;
  avatar?: string;
  intro?: string;
  modules?: AppSchema['modules'];
  edges?: AppSchema['edges'];
  permission?: AppSchema['permission'];
  teamTags?: AppSchema['teamTags'];
}
