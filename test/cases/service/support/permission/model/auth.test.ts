import { describe, expect, it } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';
import {
  ManagePermissionVal,
  PerResourceTypeEnum,
  ReadPermissionVal,
  ReadRoleVal,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import {
  getModelListWithPermission,
  getModelPermission
} from '@fastgpt/service/support/permission/model/controller';
import {
  assertModelAvailable,
  authModel,
  authModels
} from '@fastgpt/service/support/permission/model/auth';
import { getFakeUsers, getRootUser } from '@test/datas/users';
import type { SystemModelItemType } from '@fastgpt/service/core/ai/type';

const createLLMModel = ({
  id,
  requestUrl,
  tmbId,
  teamId,
  isShared = false,
  isActive = true,
  isCustom = true
}: {
  id: string;
  requestUrl: string;
  tmbId?: string;
  teamId?: string;
  isShared?: boolean;
  isActive?: boolean;
  isCustom?: boolean;
}): LLMModelItemType => ({
  id,
  type: ModelTypeEnum.llm,
  model: 'deepseek-v3',
  name: 'deepseek-v3',
  avatar: 'deepseek-v3',
  provider: 'OpenAI',
  isActive,
  isCustom,
  isShared,
  requestUrl,
  requestAuth: undefined,
  tmbId,
  teamId,
  functionCall: false,
  toolChoice: false,
  maxContext: 4096,
  maxResponse: 4096,
  quoteMaxToken: 2048
});

const installModels = (models: LLMModelItemType[]) => {
  global.systemModelList = models;
  global.systemActiveModelList = models.filter((model) => model.isActive);
  global.systemActiveDesensitizedModels = global.systemActiveModelList;
  global.systemModelIdMap = new Map(models.map((model) => [model.id, model]));
  global.llmModelIdMap = new Map(
    models.filter((model) => model.isActive).map((model) => [model.id, model])
  );
};

const listIds = async ({
  models = global.systemModelList,
  teamId,
  tmbId,
  isRoot = false,
  isOwner = false
}: {
  models?: SystemModelItemType[];
  teamId: string;
  tmbId: string;
  isRoot?: boolean;
  isOwner?: boolean;
}) =>
  (
    await getModelListWithPermission({
      models,
      teamId,
      tmbId,
      teamPer: { isOwner },
      isRoot
    })
  ).map((model) => model.id);

describe('service/support/permission/model', () => {
  it('filters model list by owner/shared/collaborator permissions and returns permission objects', async () => {
    const users = await getFakeUsers(2);
    const [userA, userB] = users.members;
    const root = await getRootUser();
    const modelIds = {
      system: '000000000000000000000001',
      a: '000000000000000000000002',
      b: '000000000000000000000003'
    };
    const systemModel = createLLMModel({
      id: modelIds.system,
      requestUrl: 'url1',
      isShared: true,
      isCustom: false
    });
    const modelA = createLLMModel({
      id: modelIds.a,
      requestUrl: 'url2',
      tmbId: userA.tmbId,
      teamId: userA.teamId
    });
    const modelB = createLLMModel({
      id: modelIds.b,
      requestUrl: 'url3',
      tmbId: userB.tmbId,
      teamId: userB.teamId,
      isActive: false
    });
    installModels([systemModel, modelA, modelB]);

    await expect(
      listIds({
        teamId: userA.teamId,
        tmbId: userA.tmbId
      })
    ).resolves.toEqual([modelIds.system, modelIds.a]);
    await expect(
      listIds({
        teamId: userB.teamId,
        tmbId: userB.tmbId
      })
    ).resolves.toEqual([modelIds.system, modelIds.b]);
    await expect(
      listIds({
        teamId: root.teamId,
        tmbId: root.tmbId,
        isRoot: true
      })
    ).resolves.toEqual([modelIds.system, modelIds.a, modelIds.b]);

    const systemPermission = await getModelPermission({
      model: systemModel,
      teamId: userA.teamId,
      tmbId: userA.tmbId,
      teamPer: { isOwner: false }
    });
    const modelAPermission = await getModelPermission({
      model: modelA,
      teamId: userA.teamId,
      tmbId: userA.tmbId,
      teamPer: { isOwner: false }
    });

    expect(systemPermission.hasReadPer).toBe(true);
    expect(systemPermission.hasWritePer).toBe(false);
    expect(modelAPermission.hasManagePer).toBe(true);

    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.model,
      teamId: userA.teamId,
      resourceId: modelA.id,
      tmbId: userB.tmbId,
      permission: ReadRoleVal
    });

    await expect(
      listIds({
        teamId: userB.teamId,
        tmbId: userB.tmbId
      })
    ).resolves.toEqual([modelIds.system, modelIds.a, modelIds.b]);
  });

  it('authorizes single models by id and does not grant write/manage on shared system models', async () => {
    const users = await getFakeUsers(2);
    const [userA, userB] = users.members;
    const modelIds = {
      system: '000000000000000000000011',
      a: '000000000000000000000012'
    };
    const systemModel = createLLMModel({
      id: modelIds.system,
      requestUrl: 'url1',
      isShared: true,
      isCustom: false
    });
    const modelA = createLLMModel({
      id: modelIds.a,
      requestUrl: 'url2',
      tmbId: userA.tmbId,
      teamId: userA.teamId
    });
    installModels([systemModel, modelA]);

    await expect(
      authModel({
        req: { auth: userA } as any,
        authToken: true,
        modelId: modelIds.a,
        per: ManagePermissionVal
      })
    ).resolves.toMatchObject({
      model: {
        id: modelIds.a,
        requestUrl: 'url2'
      }
    });

    await expect(
      authModel({
        req: { auth: userB } as any,
        authToken: true,
        modelId: modelIds.a,
        per: ReadPermissionVal
      })
    ).rejects.toBeTruthy();

    await expect(
      authModel({
        req: { auth: userA } as any,
        authToken: true,
        modelId: modelIds.system,
        per: WritePermissionVal
      })
    ).rejects.toBeTruthy();

    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.model,
      teamId: userA.teamId,
      resourceId: modelA.id,
      tmbId: userB.tmbId,
      permission: ReadRoleVal
    });

    await expect(
      authModel({
        req: { auth: userB } as any,
        authToken: true,
        modelId: modelIds.a,
        per: ReadPermissionVal
      })
    ).resolves.toMatchObject({
      model: {
        id: modelIds.a,
        requestUrl: 'url2'
      }
    });
  });

  it('does not require collaborator ObjectId lookup for root, system models, or owned models', async () => {
    const users = await getFakeUsers(1);
    const [userA] = users.members;
    const root = await getRootUser();
    const systemModel = createLLMModel({
      id: 'system-model-from-config',
      requestUrl: 'url1',
      isShared: true,
      isCustom: false
    });
    const ownedModel = createLLMModel({
      id: 'owned-model-from-config',
      requestUrl: 'url2',
      tmbId: userA.tmbId,
      teamId: userA.teamId
    });
    const privateOtherModel = createLLMModel({
      id: 'private-other-model-from-config',
      requestUrl: 'url3',
      tmbId: root.tmbId,
      teamId: root.teamId
    });
    installModels([systemModel, ownedModel, privateOtherModel]);

    await expect(
      authModel({
        req: { auth: userA } as any,
        authToken: true,
        modelId: systemModel.id,
        per: ReadPermissionVal
      })
    ).resolves.toMatchObject({
      model: {
        id: systemModel.id
      }
    });

    await expect(
      authModel({
        req: { auth: userA } as any,
        authToken: true,
        modelId: ownedModel.id,
        per: ManagePermissionVal
      })
    ).resolves.toMatchObject({
      model: {
        id: ownedModel.id
      }
    });

    await expect(
      authModels({
        req: { auth: userA } as any,
        authToken: true,
        modelIds: [systemModel.id, ownedModel.id]
      }).then(({ models }) => models.map((model) => model.id))
    ).resolves.toEqual([systemModel.id, ownedModel.id]);

    await expect(
      authModel({
        req: { auth: root } as any,
        authToken: true,
        modelId: privateOtherModel.id,
        per: ManagePermissionVal
      })
    ).resolves.toMatchObject({
      model: {
        id: privateOtherModel.id
      }
    });
  });

  it('authorizes inactive models by id and leaves active checks to call sites', async () => {
    const users = await getFakeUsers(1);
    const [userA] = users.members;
    const inactiveModel = createLLMModel({
      id: '000000000000000000000031',
      requestUrl: 'url-inactive',
      tmbId: userA.tmbId,
      teamId: userA.teamId,
      isActive: false
    });
    installModels([inactiveModel]);

    await expect(
      authModel({
        req: { auth: userA } as any,
        authToken: true,
        modelId: inactiveModel.id,
        per: ReadPermissionVal
      }).then(({ model }) => ({
        id: model.id,
        isActive: model.isActive,
        requestUrl: model.requestUrl
      }))
    ).resolves.toEqual({
      id: inactiveModel.id,
      isActive: false,
      requestUrl: 'url-inactive'
    });

    const { models } = await authModels({
      req: { auth: userA } as any,
      authToken: true,
      modelIds: [inactiveModel.id]
    });

    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({
      id: inactiveModel.id,
      isActive: false,
      requestUrl: 'url-inactive'
    });
    expect(() => assertModelAvailable(models[0])).toThrow('Model not active');
  });

  it('keeps duplicate model/name configurations separated by id for authModels', async () => {
    const users = await getFakeUsers(2);
    const [userA, userB] = users.members;
    const modelIds = {
      system: '000000000000000000000021',
      a: '000000000000000000000022',
      b: '000000000000000000000023'
    };
    const systemModel = createLLMModel({
      id: modelIds.system,
      requestUrl: 'url1',
      isShared: true,
      isCustom: false
    });
    const modelA = createLLMModel({
      id: modelIds.a,
      requestUrl: 'url2',
      tmbId: userA.tmbId,
      teamId: userA.teamId
    });
    const modelB = createLLMModel({
      id: modelIds.b,
      requestUrl: 'url3',
      tmbId: userB.tmbId,
      teamId: userB.teamId
    });
    installModels([systemModel, modelA, modelB]);

    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.model,
      teamId: userA.teamId,
      resourceId: modelA.id,
      tmbId: userB.tmbId,
      permission: ReadRoleVal
    });
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.model,
      teamId: userB.teamId,
      resourceId: modelB.id,
      tmbId: userA.tmbId,
      permission: ReadRoleVal
    });

    await expect(
      authModels({
        req: { auth: userA } as any,
        authToken: true,
        modelIds: [modelIds.system, modelIds.a, modelIds.b]
      }).then(({ models }) =>
        models.map((model) => [model.id, model.model, model.name, model.requestUrl])
      )
    ).resolves.toEqual([
      [modelIds.system, 'deepseek-v3', 'deepseek-v3', 'url1'],
      [modelIds.a, 'deepseek-v3', 'deepseek-v3', 'url2'],
      [modelIds.b, 'deepseek-v3', 'deepseek-v3', 'url3']
    ]);
  });
});
