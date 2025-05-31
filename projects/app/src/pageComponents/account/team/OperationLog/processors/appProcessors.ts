// App processors
import { AppPermission } from '@fastgpt/global/support/permission/app/controller';

export const processCreateAppMetadata = (
  metadata: {
    name?: string;
    appName: string;
    appType: string;
  },
  t: any
) => {
  return {
    ...metadata,
    appType: t(metadata.appType as any)
  };
};

export const processUpdateAppInfoMetadata = (
  metadata: {
    name?: string;
    appName: string;
    newItemNames: string[] | string;
    newItemValues: (string | undefined)[] | string;
    appType: string;
  },
  t: any
) => {
  const newItemNames = Array.isArray(metadata.newItemNames)
    ? metadata.newItemNames.map((itemName: string) => t(itemName as any)).join(',')
    : metadata.newItemNames
      ? metadata.newItemNames
          .split(',')
          .map((itemName: string) => t(itemName as any))
          .join(',')
      : '';
  return {
    ...metadata,
    newItemNames: newItemNames,
    appType: t(metadata.appType as any)
  };
};

export const processMoveAppMetadata = (
  metadata: {
    name?: string;
    appName: string;
    targetFolderName: string;
    appType: string;
  },
  t: any
) => {
  return {
    ...metadata,
    appType: t(metadata.appType as any)
  };
};

export const processDeleteAppMetadata = (
  metadata: {
    name?: string;
    appName: string;
    appType: string;
  },
  t: any
) => {
  return {
    ...metadata,
    appType: t(metadata.appType as any)
  };
};

export const processUpdateAppCollaboratorMetadata = (
  metadata: {
    name?: string;
    appName: string;
    appType: string;
    tmbList: string[];
    groupList: string[];
    orgList: string[];
    permission: string;
  },
  t: any
) => {
  const permissionValue = parseInt(metadata.permission, 10);
  const permission = new AppPermission({ per: permissionValue });
  return {
    ...metadata,
    appType: t(metadata.appType as any),
    readPermission: permission.hasReadPer ? '✔' : '✘',
    writePermission: permission.hasWritePer ? '✔' : '✘',
    managePermission: permission.hasManagePer ? '✔' : '✘'
  };
};

export const processDeleteAppCollaboratorMetadata = (
  metadata: {
    name?: string;
    appName: string;
    appType: string;
    itemName: string;
    itemValueName: string;
  },
  t: any
) => {
  return {
    ...metadata,
    appType: t(metadata.appType as any),
    itemName: t(metadata.itemName as any)
  };
};

export const processTransferAppOwnershipMetadata = (
  metadata: {
    name?: string;
    appName: string;
    appType: string;
    oldOwnerName: string;
    newOwnerName: string;
  },
  t: any
) => {
  return {
    ...metadata,
    appType: t(metadata.appType as any)
  };
};

export const processCreateAppCopyMetadata = (
  metadata: {
    name?: string;
    appName: string;
    appType: string;
  },
  t: any
) => {
  return {
    ...metadata,
    appType: t(metadata.appType as any)
  };
};

export const processUpdatePublishAppMetadata = (
  metadata: {
    name?: string;
    operationName: string;
    appName: string;
    appType: string;
  },
  t: any
) => {
  return {
    ...metadata,
    operationName: t(metadata.operationName as any),
    appType: t(metadata.appType as any)
  };
};

export const processCreateAppPublishChannelMetadata = (
  metadata: {
    name?: string;
    appName: string;
    channelName: string;
    appType: string;
  },
  t: any
) => {
  return {
    ...metadata,
    appType: t(metadata.appType as any)
  };
};

export const processUpdateAppPublishChannelMetadata = (
  metadata: {
    name?: string;
    appName: string;
    channelName: string;
    appType: string;
  },
  t: any
) => {
  return {
    ...metadata,
    appType: t(metadata.appType as any)
  };
};

export const processDeleteAppPublishChannelMetadata = (
  metadata: {
    name?: string;
    appName: string;
    channelName: string;
    appType: string;
  },
  t: any
) => {
  return {
    ...metadata,
    appType: t(metadata.appType as any)
  };
};

export const createBasicAppProcessor = (t: any) => (metadata: any) => metadata;

export const createAppProcessors = (t: any) => ({
  CREATE_APP: (metadata: any) => processCreateAppMetadata(metadata, t),
  UPDATE_APP_INFO: (metadata: any) => processUpdateAppInfoMetadata(metadata, t),
  MOVE_APP: (metadata: any) => processMoveAppMetadata(metadata, t),
  DELETE_APP: (metadata: any) => processDeleteAppMetadata(metadata, t),
  UPDATE_APP_COLLABORATOR: (metadata: any) => processUpdateAppCollaboratorMetadata(metadata, t),
  DELETE_APP_COLLABORATOR: (metadata: any) => processDeleteAppCollaboratorMetadata(metadata, t),
  TRANSFER_APP_OWNERSHIP: (metadata: any) => processTransferAppOwnershipMetadata(metadata, t),
  CREATE_APP_COPY: (metadata: any) => processCreateAppCopyMetadata(metadata, t),
  CREATE_APP_FOLDER: createBasicAppProcessor(t),
  UPDATE_PUBLISH_APP: (metadata: any) => processUpdatePublishAppMetadata(metadata, t),
  CREATE_APP_PUBLISH_CHANNEL: (metadata: any) =>
    processCreateAppPublishChannelMetadata(metadata, t),
  UPDATE_APP_PUBLISH_CHANNEL: (metadata: any) =>
    processUpdateAppPublishChannelMetadata(metadata, t),
  DELETE_APP_PUBLISH_CHANNEL: (metadata: any) =>
    processDeleteAppPublishChannelMetadata(metadata, t),
  EXPORT_APP_CHAT_LOG: createBasicAppProcessor(t)
});
