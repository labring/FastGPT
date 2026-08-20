import type { AppVersionSchemaType } from '@fastgpt/global/core/app/version/type';

export type PostPublishAppProps = {
  nodes: AppVersionSchemaType['nodes'];
  edges: AppVersionSchemaType['edges'];
  chatConfig: AppVersionSchemaType['chatConfig'];
  isPublish?: boolean;
  versionName?: string;
  autoSave?: boolean; // If it is automatically saved, only one copy of the entire app will be stored, overwriting the old version
};

export type PostRevertAppProps = {
  versionId: string;
  // edit workflow
  editNodes: AppVersionSchemaType['nodes'];
  editEdges: AppVersionSchemaType['edges'];
  editChatConfig: AppVersionSchemaType['chatConfig'];
};
