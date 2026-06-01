import type { AppSchemaType } from '@fastgpt/global/core/app/type';

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
