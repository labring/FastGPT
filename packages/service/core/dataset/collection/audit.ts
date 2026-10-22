import { DatasetCollectionTypeMap } from '@fastgpt/global/core/dataset/constants';
import { getDatasetCollectionPaths } from './paths';

/** 未知集合类型没有展示名，回退原始枚举值，避免审计里出现空对象类型。 */
export const getCollectionAuditObjectType = (type: string): string =>
  DatasetCollectionTypeMap[type as keyof typeof DatasetCollectionTypeMap]?.name ?? type;

/**
 * 生成集合审计日志的位置字段（`知识库名/父目录/子目录`），不包含集合自身。
 *
 * 位置只服务于日志展示：调用方此时已完成鉴权与写入，取路径失败不能影响主流程，
 * 因此这里吞掉查询异常并退回知识库名。
 */
export const getCollectionAuditLocation = async ({
  datasetName,
  parentId
}: {
  datasetName: string;
  parentId?: string | null;
}): Promise<string> => {
  const paths = await getDatasetCollectionPaths({ parentId: parentId ?? undefined }).catch(
    () => []
  );
  return [datasetName, ...paths.map((path) => path.parentName)].filter(Boolean).join('/');
};
