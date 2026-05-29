/**
 * dataset/controller.ts 单元测试
 *
 * 覆盖函数：
 *   - findDatasetAndAllChildren：BFS 查找 root 及所有后代 dataset
 *   - expandFolderDatasetIds：将 folder 类型展开为其非 folder 后代 ID（去重）
 *
 * 使用真实 MongoDB（由 test/setup.ts 全局配置），每个测试在独立数据库中运行。
 *
 * 运行方式（从项目根目录）：
 *   MONGODB_TEST_URI=<uri> pnpm test/cases/service/core/dataset/dataset.controller.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { UserError } from '@fastgpt/global/common/error/utils';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import {
  findDatasetAndAllChildren,
  expandFolderDatasetIds
} from '@fastgpt/service/core/dataset/controller';

// ============================================================
// 辅助函数
// ============================================================

/** 生成随机 ObjectId 字符串，用于隔离各测试的 teamId */
const newId = () => String(new Types.ObjectId());

type CreateDatasetOptions = {
  teamId: string;
  name: string;
  type?: string;
  parentId?: string | null;
};

/**
 * 在真实 MongoDB 中创建一个 dataset 文档。
 * tmbId 使用随机 ObjectId 占位，不影响被测逻辑。
 */
async function createDataset({
  teamId,
  name,
  type = DatasetTypeEnum.dataset,
  parentId = null
}: CreateDatasetOptions) {
  return MongoDataset.create({
    teamId,
    tmbId: new Types.ObjectId(),
    name,
    type,
    parentId: parentId ? new Types.ObjectId(parentId) : null,
    vectorModelId: 'text-embedding-3-small',
    agentModelId: 'gpt-4o-mini'
  });
}

// ============================================================
// findDatasetAndAllChildren
// ============================================================
describe('findDatasetAndAllChildren', () => {
  // 每个 describe 使用独立的 teamId，防止跨测试干扰
  let teamId: string;
  beforeEach(() => {
    teamId = newId();
  });

  // ----------------------------------------------------------
  // 场景 1：root dataset 不存在 → reject UserError
  // ----------------------------------------------------------
  it('root dataset 不存在时应 reject 并抛出 UserError', async () => {
    const nonexistentId = newId();

    await expect(
      findDatasetAndAllChildren({ teamId, datasetId: nonexistentId })
    ).rejects.toBeInstanceOf(UserError);

    await expect(findDatasetAndAllChildren({ teamId, datasetId: nonexistentId })).rejects.toThrow(
      'Dataset not found'
    );
  });

  // ----------------------------------------------------------
  // 场景 2：只有 root，无子节点
  // ----------------------------------------------------------
  it('只有 root 且无子节点时应返回仅含 root 的数组', async () => {
    // Arrange
    const root = await createDataset({ teamId, name: 'root' });

    // Act
    const result = await findDatasetAndAllChildren({
      teamId,
      datasetId: String(root._id)
    });

    // Assert
    expect(result).toHaveLength(1);
    expect(String(result[0]._id)).toBe(String(root._id));
  });

  // ----------------------------------------------------------
  // 场景 3：root + 一层子节点
  // ----------------------------------------------------------
  it('root 有一层子节点时应返回 root 及所有直接子节点', async () => {
    // Arrange
    const root = await createDataset({ teamId, name: 'root' });
    const child1 = await createDataset({
      teamId,
      name: 'child1',
      parentId: String(root._id)
    });
    const child2 = await createDataset({
      teamId,
      name: 'child2',
      parentId: String(root._id)
    });

    // Act
    const result = await findDatasetAndAllChildren({
      teamId,
      datasetId: String(root._id)
    });

    // Assert
    expect(result).toHaveLength(3);
    const resultIds = result.map((d) => String(d._id));
    expect(resultIds).toContain(String(root._id));
    expect(resultIds).toContain(String(child1._id));
    expect(resultIds).toContain(String(child2._id));
  });

  // ----------------------------------------------------------
  // 场景 4：多层嵌套（3 层）
  // ----------------------------------------------------------
  it('多层嵌套（3层）时应通过 BFS 收集所有后代', async () => {
    // Arrange
    //   root
    //   ├── level1a
    //   │   └── level2a
    //   └── level1b
    const root = await createDataset({ teamId, name: 'root' });
    const level1a = await createDataset({
      teamId,
      name: 'level1a',
      parentId: String(root._id)
    });
    const level1b = await createDataset({
      teamId,
      name: 'level1b',
      parentId: String(root._id)
    });
    const level2a = await createDataset({
      teamId,
      name: 'level2a',
      parentId: String(level1a._id)
    });

    // Act
    const result = await findDatasetAndAllChildren({
      teamId,
      datasetId: String(root._id)
    });

    // Assert
    expect(result).toHaveLength(4);
    const resultIds = result.map((d) => String(d._id));
    expect(resultIds).toContain(String(root._id));
    expect(resultIds).toContain(String(level1a._id));
    expect(resultIds).toContain(String(level1b._id));
    expect(resultIds).toContain(String(level2a._id));
  });

  // ----------------------------------------------------------
  // 场景 5：fields 参数——返回结果只包含指定字段
  // ----------------------------------------------------------
  it('指定 fields 时返回结果应只含对应字段', async () => {
    // Arrange
    const root = await createDataset({ teamId, name: 'root-with-fields' });
    await createDataset({ teamId, name: 'child', parentId: String(root._id) });

    // Act：只请求 name 字段
    const result = await findDatasetAndAllChildren({
      teamId,
      datasetId: String(root._id),
      fields: 'name'
    });

    // Assert：结果包含 name，但不含 type（未被 project）
    expect(result).toHaveLength(2);
    expect(result[0].name).toBeDefined();
    // Mongoose lean() 在 project 时不会返回未选字段
    expect((result[0] as any).type).toBeUndefined();
  });

  // ----------------------------------------------------------
  // 场景 6：teamId 隔离——不应返回其他 team 下的子节点
  // ----------------------------------------------------------
  it('BFS 查询应只返回属于指定 teamId 的子节点', async () => {
    // Arrange
    const otherTeamId = newId();
    const root = await createDataset({ teamId, name: 'root' });

    // 在相同 parentId 下但属于不同 team 的伪子节点
    await createDataset({
      teamId: otherTeamId,
      name: 'other-team-child',
      parentId: String(root._id)
    });

    // Act
    const result = await findDatasetAndAllChildren({
      teamId,
      datasetId: String(root._id)
    });

    // Assert：不应包含其他 team 的 dataset
    expect(result).toHaveLength(1);
    expect(String(result[0]._id)).toBe(String(root._id));
  });
});

// ============================================================
// expandFolderDatasetIds
// ============================================================
describe('expandFolderDatasetIds', () => {
  let teamId: string;
  beforeEach(() => {
    teamId = newId();
  });

  // ----------------------------------------------------------
  // 场景 1：空数组输入
  // ----------------------------------------------------------
  it('输入空数组时应返回空数组', async () => {
    const result = await expandFolderDatasetIds(teamId, []);
    expect(result).toEqual([]);
  });

  // ----------------------------------------------------------
  // 场景 2：全部为非 folder 类型
  // ----------------------------------------------------------
  it('全部为非 folder 类型时应原样返回其 ID', async () => {
    // Arrange
    const ds1 = await createDataset({ teamId, name: 'ds1', type: DatasetTypeEnum.dataset });
    const ds2 = await createDataset({
      teamId,
      name: 'ds2',
      type: DatasetTypeEnum.websiteDataset
    });

    // Act
    const result = await expandFolderDatasetIds(teamId, [String(ds1._id), String(ds2._id)]);

    // Assert
    expect(result).toHaveLength(2);
    expect(result).toContain(String(ds1._id));
    expect(result).toContain(String(ds2._id));
  });

  // ----------------------------------------------------------
  // 场景 3：全部为 folder，且 folder 下无子节点
  // ----------------------------------------------------------
  it('全部为 folder 且无子节点时应返回空数组', async () => {
    // Arrange
    const folder1 = await createDataset({
      teamId,
      name: 'folder1',
      type: DatasetTypeEnum.folder
    });
    const folder2 = await createDataset({
      teamId,
      name: 'folder2',
      type: DatasetTypeEnum.folder
    });

    // Act
    const result = await expandFolderDatasetIds(teamId, [String(folder1._id), String(folder2._id)]);

    // Assert：folder 本身不计入结果，子节点为空，结果为空
    expect(result).toEqual([]);
  });

  // ----------------------------------------------------------
  // 场景 4：混合类型（folder + 非 folder）
  // ----------------------------------------------------------
  it('混合类型时 folder 展开、非 folder 直接保留', async () => {
    // Arrange
    const folder = await createDataset({
      teamId,
      name: 'folder',
      type: DatasetTypeEnum.folder
    });
    const ds = await createDataset({ teamId, name: 'ds', type: DatasetTypeEnum.dataset });
    const childDs = await createDataset({
      teamId,
      name: 'childDs',
      type: DatasetTypeEnum.dataset,
      parentId: String(folder._id)
    });

    // Act
    const result = await expandFolderDatasetIds(teamId, [String(folder._id), String(ds._id)]);

    // Assert
    expect(result).toHaveLength(2);
    expect(result).toContain(String(ds._id));
    expect(result).toContain(String(childDs._id));
    // folder 本身不应在结果中
    expect(result).not.toContain(String(folder._id));
  });

  // ----------------------------------------------------------
  // 场景 5：多层嵌套 folder（folder → folder → 非 folder）
  // ----------------------------------------------------------
  it('多层嵌套 folder 时应递归展开直至叶子节点', async () => {
    // Arrange
    //   folder1
    //   └── folderA
    //       ├── ds1
    //       └── ds2
    const folder1 = await createDataset({
      teamId,
      name: 'folder1',
      type: DatasetTypeEnum.folder
    });
    const folderA = await createDataset({
      teamId,
      name: 'folderA',
      type: DatasetTypeEnum.folder,
      parentId: String(folder1._id)
    });
    const ds1 = await createDataset({
      teamId,
      name: 'ds1',
      type: DatasetTypeEnum.dataset,
      parentId: String(folderA._id)
    });
    const ds2 = await createDataset({
      teamId,
      name: 'ds2',
      type: DatasetTypeEnum.dataset,
      parentId: String(folderA._id)
    });

    // Act
    const result = await expandFolderDatasetIds(teamId, [String(folder1._id)]);

    // Assert：只含叶子节点，folder 本身不在结果内
    expect(result).toHaveLength(2);
    expect(result).toContain(String(ds1._id));
    expect(result).toContain(String(ds2._id));
    expect(result).not.toContain(String(folder1._id));
    expect(result).not.toContain(String(folderA._id));
  });

  // ----------------------------------------------------------
  // 场景 6：结果去重（同一非 folder dataset 被多个 folder 包含）
  // ----------------------------------------------------------
  it('结果中重复出现的非 folder ID 应被去重', async () => {
    // Arrange
    // 注意：真实场景下一个 dataset 只有一个 parentId，
    // 但同一 teamId 下可以存在 id 相同的输入（来自外部重复传参）。
    // 这里通过直接传入重复 ID 来验证 Set 去重逻辑。
    const ds = await createDataset({ teamId, name: 'ds', type: DatasetTypeEnum.dataset });

    // Act：输入同一个 ID 两次
    const result = await expandFolderDatasetIds(teamId, [String(ds._id), String(ds._id)]);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(String(ds._id));
  });

  // ----------------------------------------------------------
  // 场景 7：同层多个 folder 的 BFS 批量查询
  // ----------------------------------------------------------
  it('同层多个 folder 的子节点应在一次 BFS 批量查询中被收集', async () => {
    // Arrange
    //   folder1 → ds1
    //   folder2 → ds2
    const folder1 = await createDataset({
      teamId,
      name: 'folder1',
      type: DatasetTypeEnum.folder
    });
    const folder2 = await createDataset({
      teamId,
      name: 'folder2',
      type: DatasetTypeEnum.folder
    });
    const ds1 = await createDataset({
      teamId,
      name: 'ds1',
      type: DatasetTypeEnum.dataset,
      parentId: String(folder1._id)
    });
    const ds2 = await createDataset({
      teamId,
      name: 'ds2',
      type: DatasetTypeEnum.dataset,
      parentId: String(folder2._id)
    });

    // Act
    const result = await expandFolderDatasetIds(teamId, [String(folder1._id), String(folder2._id)]);

    // Assert：两个 folder 的子节点均被收集
    expect(result).toHaveLength(2);
    expect(result).toContain(String(ds1._id));
    expect(result).toContain(String(ds2._id));
  });

  // ----------------------------------------------------------
  // 场景 8：teamId 隔离——不返回其他 team 的子节点
  // ----------------------------------------------------------
  it('展开 folder 时不应包含其他 teamId 下的子节点', async () => {
    // Arrange
    const otherTeamId = newId();
    const folder = await createDataset({
      teamId,
      name: 'folder',
      type: DatasetTypeEnum.folder
    });

    // 属于其他 team 的子节点（parentId 相同但 teamId 不同）
    await createDataset({
      teamId: otherTeamId,
      name: 'other-team-child',
      type: DatasetTypeEnum.dataset,
      parentId: String(folder._id)
    });

    // Act
    const result = await expandFolderDatasetIds(teamId, [String(folder._id)]);

    // Assert：不应包含其他 team 的 dataset
    expect(result).toEqual([]);
  });

  // ----------------------------------------------------------
  // 场景 9：输入 ID 不属于指定 teamId（过滤无效输入）
  // ----------------------------------------------------------
  it('输入的 ID 不属于指定 teamId 时应被过滤忽略', async () => {
    // Arrange
    const otherTeamId = newId();
    const ds = await createDataset({
      teamId: otherTeamId,
      name: 'ds-other-team',
      type: DatasetTypeEnum.dataset
    });

    // Act：用自己的 teamId 查，但 ds 属于另一个 team
    const result = await expandFolderDatasetIds(teamId, [String(ds._id)]);

    // Assert：find 过滤了 teamId，结果为空
    expect(result).toEqual([]);
  });
});
