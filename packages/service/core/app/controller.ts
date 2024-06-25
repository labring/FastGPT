import { AppDetailType, AppSchema } from '@fastgpt/global/core/app/type';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getLLMModel } from '../ai/model';
import { MongoAppVersion } from './version/schema';
import { MongoApp } from './schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { mongoSessionRun } from '../../common/mongo/sessionRun';
import { MongoResourcePermission } from 'support/permission/schema';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { ResourcePermissionType } from '@fastgpt/global/support/permission/type';

export const beforeUpdateAppFormat = <T extends AppSchema['modules'] | undefined>({
  nodes
}: {
  nodes: T;
}) => {
  if (nodes) {
    let maxTokens = 3000;

    nodes.forEach((item) => {
      if (
        item.flowNodeType === FlowNodeTypeEnum.chatNode ||
        item.flowNodeType === FlowNodeTypeEnum.tools
      ) {
        const model =
          item.inputs.find((item) => item.key === NodeInputKeyEnum.aiModel)?.value || '';
        const chatModel = getLLMModel(model);
        const quoteMaxToken = chatModel.quoteMaxToken || 3000;

        maxTokens = Math.max(maxTokens, quoteMaxToken);
      }
    });

    nodes.forEach((item) => {
      if (item.flowNodeType === FlowNodeTypeEnum.datasetSearchNode) {
        item.inputs.forEach((input) => {
          if (input.key === NodeInputKeyEnum.datasetMaxTokens) {
            const val = input.value as number;
            if (val > maxTokens) {
              input.value = maxTokens;
            }
          }
        });
      }
    });
  }

  return {
    nodes
  };
};

export const getAppLatestVersion = async (appId: string, app?: AppSchema) => {
  const version = await MongoAppVersion.findOne({
    appId
  }).sort({
    time: -1
  });

  if (version) {
    return {
      nodes: version.nodes,
      edges: version.edges,
      chatConfig: version.chatConfig || app?.chatConfig || {}
    };
  }
  return {
    nodes: app?.modules || [],
    edges: app?.edges || [],
    chatConfig: app?.chatConfig || {}
  };
};

/* Get apps */
export async function findAppAndAllChildren({
  teamId,
  appId,
  fields
}: {
  teamId: string;
  appId: string;
  fields?: string;
}): Promise<AppSchema[]> {
  const find = async (id: string) => {
    const children = await MongoApp.find(
      {
        teamId,
        parentId: id
      },
      fields
    ).lean();

    let apps = children;

    for (const child of children) {
      const grandChildrenIds = await find(child._id);
      apps = apps.concat(grandChildrenIds);
    }

    return apps;
  };
  const [app, childDatasets] = await Promise.all([MongoApp.findById(appId, fields), find(appId)]);

  if (!app) {
    return Promise.reject('Dataset not found');
  }

  return [app, ...childDatasets];
}

// sync the permission of the folder to all its children
export const syncPermission = async (app: AppSchema) => {
  // only folder has permission
  if (app.type !== AppTypeEnum.folder) {
    return;
  }

  // get all folders and the resource permission of the app
  mongoSessionRun(async (session) => {
    const [allFolders, rp] = await Promise.all([
      MongoApp.find(
        {
          teamId: app.teamId,
          type: AppTypeEnum.folder,
          inheritPermission: true
        },
        null,
        { session }
      ),
      MongoResourcePermission.find(
        {
          teamId: app.teamId,
          appId: app._id,
          resourceType: PerResourceTypeEnum.app
        },
        null,
        { session }
      )
    ]);

    // bfs
    const queue = [app._id.toString()];
    const children: string[] = [];

    while (queue.length) {
      const parentId = queue.shift();
      const folderChildren = allFolders.filter((folder) => folder.parentId === parentId);
      children.push(...folderChildren.map((folder) => folder._id));
      queue.push(...folderChildren.map((folder) => folder._id));
    }

    // sync the defaultPermission
    await MongoApp.updateMany(
      {
        _id: { $in: children }
      },
      {
        defaultPermission: app.defaultPermission
      },
      { session }
    );

    // sync the resource permission
    return await Promise.all(
      children.map(async (childId) => {
        // delete first
        await MongoResourcePermission.deleteMany({
          teamId: app.teamId,
          appId: childId,
          resourceType: PerResourceTypeEnum.app
        });
        // then write in
        return await MongoResourcePermission.updateMany(
          {
            teamId: app.teamId,
            appId: childId,
            resourceType: PerResourceTypeEnum.app
          },
          {
            permission: rp[0].permission
          },
          { session, upsert: true }
        );
      })
    );
  });
};

// resume the inherit permission of the app
export const resumeInheritPermission = async (app: AppDetailType) => {
  const isFolder = app.type === AppTypeEnum.folder;

  if (!app.parentId) {
    // it is a root folder. which does not have a parent.
    return Promise.reject(AppErrEnum.inheritPermissionError);
  }

  mongoSessionRun(async (session) => {
    const parentApp = await MongoApp.findById(app.parentId).lean().session(session);

    app.inheritPermission = true;
    app.defaultPermission = parentApp.defaultPermission;

    // update the app's defaultPermission and inheritPermission itself
    await MongoApp.updateOne(
      {
        _id: app._id
      },
      {
        inheritPermission: true,
        defaultPermission: parentApp.defaultPermission // it is ok even it is a app, as we will not use it anyway.
      },
      { session }
    );
  });

  if (!isFolder) {
    // app. Collaborator on it is unnessary anymore. delete them.
    await MongoResourcePermission.deleteMany({ appId: app._id });
  }

  syncPermission(app); // sync
};

// should be called **before** a folder/app's permission changed.
export const removeInheritPermission = async (
  app: AppSchema,
  updatePermissionCallback: (parent: AppSchema, rp: ResourcePermissionType[]) => void
) => {
  app.inheritPermission = false;
  const [parent, rp] = await Promise.all([
    MongoApp.findById(app._id).lean(),
    MongoResourcePermission.find({
      resourceId: app.parentId,
      resourceType: PerResourceTypeEnum.app,
      teamId: app.teamId
    })
  ]);
  app.defaultPermission = parent.defaultPermission;
  updatePermissionCallback(parent, rp);
  syncPermission(app);
};
