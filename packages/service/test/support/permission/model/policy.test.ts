import { beforeEach, describe, expect, it } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { AIModelDataSchema } from '@fastgpt/global/core/ai/model/schema';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import {
  ManageRoleVal,
  ReadRoleVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { SystemErrEnum } from '@fastgpt/global/common/error/code/system';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import {
  assertModelInstancePolicy,
  authModelCollaboratorManage,
  authModelCollaboratorRead,
  canReadModelCollaborators
} from '@fastgpt/service/support/permission/model/policy';

const teamId = String(new Types.ObjectId());
const tmbId = String(new Types.ObjectId());
const actor = {
  teamId,
  tmbId,
  isRoot: false,
  tmb: { permission: new TeamPermission({ isOwner: true }) }
};
const model = AIModelDataSchema.parse({
  modelId: String(new Types.ObjectId()),
  scope: 'team',
  teamId,
  tmbId,
  type: 'llm',
  model: 'policy-model',
  name: 'Policy',
  provider: 'OpenAI',
  isActive: true,
  config: { maxContext: 8192, maxResponse: 2048, quoteMaxToken: 4000 }
});

beforeEach(() => {
  global.feConfigs = { isPlus: true } as typeof global.feConfigs;
});

describe('assertModelInstancePolicy', () => {
  it('allows an owner and binds an ownership-free draft only when explicitly requested', async () => {
    await expect(
      assertModelInstancePolicy({ actor, model, resource: 'model' })
    ).resolves.toMatchObject({ ownerTmbId: tmbId });
    const draft = { scope: 'team' };
    await expect(
      assertModelInstancePolicy({ actor, model: draft, resource: 'model', allowMissingOwner: true })
    ).resolves.toMatchObject({ ownerTmbId: tmbId });
    await expect(
      assertModelInstancePolicy({ actor, model: draft, resource: 'model' })
    ).rejects.toBe(ModelErrEnum.unExist);
  });
  it.each([{ teamId: String(new Types.ObjectId()) }, { tmbId: String(new Types.ObjectId()) }])(
    'rejects another owner even for root: %j',
    async (override) => {
      await expect(
        assertModelInstancePolicy({
          actor: { ...actor, isRoot: true },
          model: { ...model, ...override },
          resource: 'model',
          allowMissingOwner: true
        })
      ).rejects.toBe(ModelErrEnum.unExist);
    }
  );
  it('requires root for system models and the management permission for team models', async () => {
    await expect(
      assertModelInstancePolicy({ actor, model: { scope: 'system' }, resource: 'model' })
    ).rejects.toBe(ModelErrEnum.rootOnlyPermit);
    await expect(
      assertModelInstancePolicy({
        actor: { ...actor, isRoot: true },
        model: { scope: 'system' },
        resource: 'model'
      })
    ).resolves.toMatchObject({ teamId, tmbId });
    await expect(
      assertModelInstancePolicy({
        actor: { ...actor, tmb: { permission: new TeamPermission() } },
        model,
        resource: 'channel'
      })
    ).rejects.toBe(ModelErrEnum.unAuthChannel);
  });
  it('gates team models by edition and feature without disabling system models', async () => {
    global.feConfigs = { isPlus: false } as typeof global.feConfigs;
    await expect(assertModelInstancePolicy({ actor, model, resource: 'model' })).rejects.toBe(
      SystemErrEnum.commercialFeature
    );
    await expect(
      assertModelInstancePolicy({
        actor: { ...actor, isRoot: true },
        model: { scope: 'system' },
        resource: 'model'
      })
    ).resolves.toBeDefined();
    global.feConfigs = { isPlus: true, enable_team_model: false } as typeof global.feConfigs;
    await expect(assertModelInstancePolicy({ actor, model, resource: 'model' })).rejects.toBe(
      ModelErrEnum.teamModelDisabled
    );
  });
});

describe('model collaborator policies', () => {
  it('makes system visibility readable to members while keeping authorization writes restricted', async () => {
    const member = { ...actor, tmb: { permission: new TeamPermission() } };
    const systemModel = { ...model, scope: 'system' as const };
    await expect(canReadModelCollaborators({ ...member, model: systemModel })).resolves.toBe(true);
    await expect(authModelCollaboratorRead({ ...member, model: systemModel })).resolves.toEqual(
      systemModel
    );
    await expect(
      authModelCollaboratorManage({ ...member, model: systemModel })
    ).rejects.toMatchObject({ message: ModelErrEnum.unAuthModel });
    await expect(authModelCollaboratorManage({ ...actor, model: systemModel })).resolves.toEqual(
      systemModel
    );
    await expect(
      authModelCollaboratorManage({ ...member, isRoot: true, model: systemModel })
    ).resolves.toEqual(systemModel);
  });
  it('hides missing/cross-team models and never gives root implicit access to private ownership', async () => {
    await expect(canReadModelCollaborators({ ...actor })).resolves.toBe(false);
    await expect(authModelCollaboratorRead({ ...actor })).rejects.toMatchObject({
      message: ModelErrEnum.unExist
    });
    await expect(authModelCollaboratorManage({ ...actor })).rejects.toMatchObject({
      message: ModelErrEnum.unExist
    });
    await expect(
      canReadModelCollaborators({
        ...actor,
        model: { ...model, teamId: String(new Types.ObjectId()) }
      })
    ).resolves.toBe(false);
    await expect(canReadModelCollaborators({ ...actor, model })).resolves.toBe(true);
    await expect(authModelCollaboratorManage({ ...actor, model })).resolves.toEqual(model);
    const other = { ...actor, tmbId: String(new Types.ObjectId()), isRoot: true };
    await expect(canReadModelCollaborators({ ...other, model })).resolves.toBe(false);
    await expect(authModelCollaboratorManage({ ...other, model })).rejects.toMatchObject({
      message: ModelErrEnum.unExist
    });
  });
  it.each([ManageRoleVal, ReadRoleVal])(
    'denies non-owners even with resource role %s',
    async (permission) => {
      const other = { ...actor, tmbId: String(new Types.ObjectId()) };
      await MongoResourcePermission.create({
        resourceType: PerResourceTypeEnum.model,
        teamId,
        tmbId: other.tmbId,
        resourceId: model.modelId,
        permission
      });
      await expect(canReadModelCollaborators({ ...other, model })).resolves.toBe(false);
      await expect(authModelCollaboratorRead({ ...other, model })).rejects.toMatchObject({
        message: ModelErrEnum.unExist
      });
      await expect(authModelCollaboratorManage({ ...other, model })).rejects.toMatchObject({
        message: ModelErrEnum.unExist
      });
      await expect(
        authModelCollaboratorManage({ ...other, model, isRoot: true })
      ).rejects.toMatchObject({ message: ModelErrEnum.unExist });
    }
  );
});
