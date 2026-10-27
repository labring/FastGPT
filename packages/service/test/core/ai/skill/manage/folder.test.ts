import { describe, it, expect, vi } from 'vitest';
import {
  createSkillFolder,
  getSkillFolderPath
} from '@fastgpt/service/core/ai/skill/manage/folder';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { AgentSkillSourceEnum, AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { defaultSubtreeMaxDepth } from '@fastgpt/global/common/parentFolder/subtree';
import { serviceEnv } from '@fastgpt/service/env';
import { Types } from '@fastgpt/service/common/mongo';

const fixture = () => ({
  teamId: new Types.ObjectId().toHexString(),
  tmbId: new Types.ObjectId().toHexString()
});

describe('createSkillFolder', () => {
  it('uses the caller transaction when the parent has just been created', async () => {
    const scope = fixture();
    const { mongoSessionRun } = await vi.importActual<
      typeof import('@fastgpt/service/common/mongo/sessionRun')
    >('@fastgpt/service/common/mongo/sessionRun');
    const child = await mongoSessionRun(async (session) => {
      const parent = await createSkillFolder({ ...scope, name: 'parent' }, session);
      return createSkillFolder({ ...scope, name: 'child', parentId: String(parent._id) }, session);
    });
    expect(await MongoAgentSkills.countDocuments({ _id: child._id })).toBe(1);
  });

  it('rejects leaf parents and enforces the folder creation depth boundary', async () => {
    const scope = fixture();
    const leaf = await MongoAgentSkills.create({
      ...scope,
      name: 'leaf',
      source: AgentSkillSourceEnum.personal,
      type: AgentSkillTypeEnum.skill
    });
    await expect(
      createSkillFolder({ ...scope, name: 'invalid', parentId: String(leaf._id) })
    ).rejects.toBe(CommonErrEnum.invalidParams);
    let parentId: string | null = null;
    for (let i = 0; i < serviceEnv.MAX_FOLDER_DEPTH; i++) {
      const folder = await createSkillFolder({ ...scope, name: `level-${i}`, parentId });
      parentId = String(folder._id);
    }
    await expect(createSkillFolder({ ...scope, name: 'overflow', parentId })).rejects.toBe(
      CommonErrEnum.folderDepthLimit
    );
    expect(await MongoAgentSkills.countDocuments({ name: { $in: ['invalid', 'overflow'] } })).toBe(
      0
    );
  });
});

describe('getSkillFolderPath', () => {
  it('returns parent/current paths in root order and handles missing IDs', async () => {
    const scope = fixture();
    const root = await createSkillFolder({ ...scope, name: 'root' });
    const child = await createSkillFolder({ ...scope, name: 'child', parentId: String(root._id) });
    await expect(getSkillFolderPath(null, 'current', scope.teamId)).resolves.toEqual([]);
    await expect(
      getSkillFolderPath(new Types.ObjectId().toHexString(), 'current', scope.teamId)
    ).resolves.toEqual([]);
    await expect(getSkillFolderPath(String(child._id), 'parent', scope.teamId)).resolves.toEqual([
      { parentId: String(root._id), parentName: 'root' }
    ]);
    await expect(getSkillFolderPath(String(child._id), 'current', scope.teamId)).resolves.toEqual([
      { parentId: String(root._id), parentName: 'root' },
      { parentId: String(child._id), parentName: 'child' }
    ]);
  });

  it.each(['self', 'two-node'] as const)('terminates on a %s cycle', async (cycle) => {
    const scope = fixture();
    const a = await createSkillFolder({ ...scope, name: 'A' });
    const b =
      cycle === 'self'
        ? a
        : await createSkillFolder({ ...scope, name: 'B', parentId: String(a._id) });
    await MongoAgentSkills.updateOne({ _id: a._id }, { parentId: b._id });
    const paths = await getSkillFolderPath(String(a._id), 'current', scope.teamId);
    expect(paths.map(({ parentId }) => parentId)).toEqual(
      cycle === 'self' ? [String(a._id)] : [String(b._id), String(a._id)]
    );
  });

  it('caps traversal at the shared guard rather than the creation depth policy', async () => {
    const scope = fixture();
    const ids: string[] = [];
    for (let i = 0; i < defaultSubtreeMaxDepth + 1; i++) {
      const folder = await MongoAgentSkills.create({
        ...scope,
        name: `level-${i}`,
        source: AgentSkillSourceEnum.personal,
        type: AgentSkillTypeEnum.folder,
        parentId: ids.at(-1) ?? null
      });
      ids.push(String(folder._id));
    }
    const paths = await getSkillFolderPath(ids.at(-1)!, 'current', scope.teamId);
    expect(paths.map(({ parentId }) => parentId)).toEqual(ids.slice(1));
  });
});
