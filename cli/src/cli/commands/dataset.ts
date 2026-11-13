import type { CliCommandSpec } from '../pipeline';
import { createDatasetCollectionCommandSpecs } from './dataset/collection';
import { createDatasetDataCommandSpecs } from './dataset/data';
import { createDatasetRootCommandSpecs } from './dataset/dataset';
import { createDatasetTagSynonymCommandSpecs } from './dataset/tag-synonym';
import { createDatasetTrainCommandSpecs } from './dataset/train';

/**
 * 汇总知识库域（PRD-02.1 ~ PRD-02.3）全链路 CLI 命令：
 * 主资源 CRUD/导出/同步/批量操作/权限、集合导入/文件上传、分块数据/索引、训练监控、标签与同义词。
 */
export function createDatasetCommandSpecs(): CliCommandSpec[] {
  return [
    ...createDatasetRootCommandSpecs(),
    ...createDatasetCollectionCommandSpecs(),
    ...createDatasetDataCommandSpecs(),
    ...createDatasetTrainCommandSpecs(),
    ...createDatasetTagSynonymCommandSpecs()
  ];
}
