import { authDatasetByTmbId } from '../../support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import Papa from 'papaparse';

// TODO: 需要优化成批量获取权限
export const filterDatasetsByTmbId = async ({
  datasetIds,
  tmbId
}: {
  datasetIds: string[];
  tmbId: string;
}) => {
  const permissions = await Promise.all(
    datasetIds.map(async (datasetId) => {
      try {
        await authDatasetByTmbId({
          tmbId,
          datasetId,
          per: ReadPermissionVal
        });
        return true;
      } catch (error) {
        console.log(`Dataset ${datasetId} access denied:`, error);
        return false;
      }
    })
  );

  // Then filter datasetIds based on permissions
  return datasetIds.filter((_, index) => permissions[index]);
};

export const parseDatasetBackup2Chunks = (rawText: string, imageIdList?: string[]) => {
  const csvArr = Papa.parse(rawText).data as string[][];

  if (csvArr.length < 2) {
    return { chunks: [] };
  }
  var header = csvArr[0];
  header = header.map((h) => h.trim());
  // 查找indexes列的起始位置
  let indexesStartIndex = -1;
  for (let i = 0; i < header.length; i++) {
    if (header[i] == 'indexes') {
      indexesStartIndex = i;
      break;
    }
  }
  if (indexesStartIndex == 2) {
    const chunks = csvArr
      .slice(1)
      .map((item) => ({
        q: item[0] || '',
        a: item[1] || '',
        indexes: item.slice(2).filter((item) => item.trim()),
        imageIdList
      }))
      .filter((item) => item.q || item.a);
    return { chunks };
  } else {
    // 从q,a到indexes之间的列为元数据列
    const chunks = csvArr
      .slice(1)
      .map((item) => {
        const q = item[0] || '';
        const a = item[1] || '';

        const indexes = [];
        const metadata = new Map<string, string>();
        for (let i = 2; i < item.length; i++) {
          const value = item[i]?.trim();
          if (!value) continue;
          if (i >= indexesStartIndex) {
            // indexes及之后的列作为indexes
            indexes.push(value);
          } else {
            // 非q、a、indexes列作为metadata
            if (!header[i]) continue;
            metadata.set(header[i], value);
          }
        }
        return {
          q,
          a,
          indexes: indexes.length > 0 ? indexes : undefined,
          imageIdList,
          metadata: metadata.size > 0 ? metadata : undefined
        };
      })
      .filter((item) => item.q || item.a);
    return { chunks };
  }
};
