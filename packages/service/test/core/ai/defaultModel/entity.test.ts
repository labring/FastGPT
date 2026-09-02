import { beforeEach, describe, expect, it } from 'vitest';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import {
  findSystemDefaultModelIds,
  upsertSystemDefaultModelIds
} from '@fastgpt/service/core/ai/defaultModel/entity';
import { MongoAIDefaultModel } from '@fastgpt/service/core/ai/defaultModel/schema';

describe('AI default model entity', () => {
  beforeEach(async () => {
    await MongoAIDefaultModel.deleteMany({});
  });

  it('returns an empty configuration before system defaults are configured', async () => {
    await expect(findSystemDefaultModelIds()).resolves.toEqual({});
  });

  it('upserts the only system-scoped default record', async () => {
    await upsertSystemDefaultModelIds({ llm: 'llm-1' });
    await upsertSystemDefaultModelIds({ llm: 'llm-2', embedding: 'embedding-1' });

    await expect(
      MongoAIDefaultModel.countDocuments({ scope: ModelScopeEnum.system })
    ).resolves.toBe(1);
    await expect(findSystemDefaultModelIds()).resolves.toEqual({
      llm: 'llm-2',
      embedding: 'embedding-1'
    });
  });

  it('enforces one physical document for the system scope', async () => {
    await MongoAIDefaultModel.create({ scope: ModelScopeEnum.system, defaultModelIds: {} });

    await expect(
      MongoAIDefaultModel.create({ scope: ModelScopeEnum.system, defaultModelIds: {} })
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('requires an owner team for a team-scoped default record', async () => {
    await expect(
      MongoAIDefaultModel.create({ scope: ModelScopeEnum.team, defaultModelIds: {} })
    ).rejects.toThrow('teamId');
  });
});
