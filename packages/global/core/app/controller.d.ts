import type { ParentIdType } from 'common/parentFolder/type';
import type { AppSchemaType } from './type';
import type { AppTypeEnum } from './constants';

export type CreateAppProps = {
  parentId?: ParentIdType;
  name?: string;
  avatar?: string;
  intro?: string;
  type?: AppTypeEnum;
  modules: AppSchemaType['modules'];
  edges?: AppSchemaType['edges'];
};
export type CreateHttpPluginChildrenPros = Omit<CreateAppProps, 'type'> & {
  parentId: ParentIdType;
  name: string;
  intro: string;
  avatar: string;
  modules: AppSchemaType['modules'];
  edges: AppSchemaType['edges'];
  pluginData: {
    pluginUniId: string;
  };
};
