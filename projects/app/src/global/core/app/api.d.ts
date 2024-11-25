import { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { AppSchema } from '@fastgpt/global/core/app/type';

export type AppUpdateParams = {
  parentId?: ParentIdType;
  name?: string;
  type?: AppTypeEnum;
  avatar?: string;
  intro?: string;
  nodes?: AppSchema['modules'];
  edges?: AppSchema['edges'];
  chatConfig?: AppSchema['chatConfig'];
  teamTags?: AppSchema['teamTags'];
};

export type PostPublishAppProps = {
  nodes: AppSchema['modules'];
  edges: AppSchema['edges'];
  chatConfig: AppSchema['chatConfig'];
  isPublish?: boolean;
  versionName?: string;
};

export type PostRevertAppProps = {
  versionId: string;
  // edit workflow
  editNodes: AppSchema['modules'];
  editEdges: AppSchema['edges'];
  editChatConfig: AppSchema['chatConfig'];
};

export type AppChangeOwnerBody = {
  appId: string;
  ownerId: string;
};
