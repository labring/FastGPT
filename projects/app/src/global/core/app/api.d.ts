import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { AppSchema } from '@fastgpt/global/core/app/type';

export type CreateAppParams = {
  name?: string;
  avatar?: string;
  type?: `${AppTypeEnum}`;
  modules: AppSchema['modules'];
  edges?: AppSchema['edges'];
};

export type AppUpdateParams = {
  name?: string;
  type?: `${AppTypeEnum}`;
  avatar?: string;
  intro?: string;
  nodes?: AppSchema['modules'];
  edges?: AppSchema['edges'];
  chatConfig?: AppSchema['chatConfig'];
  permission?: AppSchema['permission'];
  teamTags?: AppSchema['teamTags'];
};

export type PostPublishAppProps = {
  type: `${AppTypeEnum}`;
  nodes: AppSchema['modules'];
  edges: AppSchema['edges'];
  chatConfig: AppSchema['chatConfig'];
};

export type PostRevertAppProps = {
  versionId: string;
  // edit workflow
  editNodes: AppSchema['modules'];
  editEdges: AppSchema['edges'];
};
