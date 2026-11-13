import type { CliCommandSpec } from '../pipeline';
import { createDatasetCollectionCommandSpecs } from './dataset/collection';
import { createDatasetDataCommandSpecs } from './dataset/data';
import { createDatasetRootCommandSpecs } from './dataset/dataset';

/**
 * 汇总知识库域（System OpenAPI）CLI 命令：
 * 主资源 CRUD/联合检索/批量移动与删除、集合管理与直接导入、分块数据 CRUD/批量推送。
 */
export function createDatasetCommandSpecs(): CliCommandSpec[] {
  return [
    ...createDatasetRootCommandSpecs(),
    ...createDatasetCollectionCommandSpecs(),
    ...createDatasetDataCommandSpecs()
  ];
}
