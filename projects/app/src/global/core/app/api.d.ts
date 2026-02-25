import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import type { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type { AppSchemaType } from '@fastgpt/global/core/app/type';

export type AppUpdateParams = {
  parentId?: ParentIdType;
  name?: string;
  type?: AppTypeEnum;
  avatar?: string;
  intro?: string;
  nodes?: AppSchemaType['modules'];
  edges?: AppSchemaType['edges'];
  chatConfig?: AppSchemaType['chatConfig'];
  teamTags?: AppSchemaType['teamTags'];
};

export type PostPublishAppProps = {
  nodes: AppSchemaType['modules'];
  edges: AppSchemaType['edges'];
  chatConfig: AppSchemaType['chatConfig'];
  isPublish?: boolean;
  versionName?: string;
  autoSave?: boolean; // If it is automatically saved, only one copy of the entire app will be stored, overwriting the old version
};

export type PostRevertAppProps = {
  versionId: string;
  // edit workflow
  editNodes: AppSchemaType['modules'];
  editEdges: AppSchemaType['edges'];
  editChatConfig: AppSchemaType['chatConfig'];
};

export type AppChangeOwnerBody = {
  appId: string;
  ownerId: string;
};
