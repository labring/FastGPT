import type { ParentIdType } from 'common/parentFolder/type';
import type { AppSchema, AppTypeEnum } from './type';

export type CreateAppProps = {
  parentId?: ParentIdType;
  name?: string;
  avatar?: string;
  intro?: string;
  type?: AppTypeEnum;
  modules: AppSchema['modules'];
  edges?: AppSchema['edges'];
};
export type CreateHttpPluginChildrenPros = Omit<CreateAppProps, 'type'> & {
  parentId: ParentIdType;
  name: string;
  intro: string;
  avatar: string;
  modules: AppSchema['modules'];
  edges: AppSchema['edges'];
  pluginData: {
    pluginUniId: string;
  };
};
