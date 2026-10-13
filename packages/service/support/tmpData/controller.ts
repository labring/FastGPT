import {
  TmpDataExpireTime,
  type TmpDataMetadata,
  type TmpDataType,
  type TmpDataWithMetadataEnum
} from '@fastgpt/global/support/tmpData/constants';
import { MongoTmpData } from './schema';
import { type TmpDataSchema } from '@fastgpt/global/support/tmpData/type';
import { addMilliseconds } from 'date-fns';

function getDataId<T extends TmpDataWithMetadataEnum>(type: T, metadata: TmpDataMetadata<T>) {
  return `${type}--${Object.values(metadata).join('--')}`;
}

export async function getTmpData<T extends TmpDataWithMetadataEnum>({
  type,
  metadata
}: {
  type: T;
  metadata: TmpDataMetadata<T>;
}) {
  return (await MongoTmpData.findOne({
    dataId: getDataId(type, metadata),
    // MongoDB TTL 清理是异步的，读取边界需要主动排除已过期记录。
    expireAt: { $gt: new Date() }
  }).lean()) as TmpDataSchema<TmpDataType<T>> | null;
}

export function setTmpData<T extends TmpDataWithMetadataEnum>({
  type,
  metadata,
  data
}: {
  type: T;
  metadata: TmpDataMetadata<T>;
  data: TmpDataType<T>;
}) {
  return MongoTmpData.updateOne(
    {
      dataId: getDataId(type, metadata)
    },
    {
      dataId: getDataId(type, metadata),
      data,
      expireAt: addMilliseconds(Date.now(), TmpDataExpireTime[type])
    },
    {
      upsert: true
    }
  );
}
