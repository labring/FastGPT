import type { TmpDataEnum } from '@fastgpt/global/support/tmpData/constant';
import {
  TmpDataExpireTime,
  type TmpDataMetadata,
  type TmpDataType
} from '@fastgpt/global/support/tmpData/constant';
import { MongoTmpData } from './schema';
import { type TmpDataSchema } from '@fastgpt/global/support/tmpData/type';
import { addMilliseconds } from 'date-fns';

function getDataId<T extends TmpDataEnum>(type: T, metadata: TmpDataMetadata<T>) {
  return `${type}--${Object.values(metadata).join('--')}`;
}

export async function getTmpData<T extends TmpDataEnum>({
  type,
  metadata
}: {
  type: T;
  metadata: TmpDataMetadata<T>;
}) {
  return (await MongoTmpData.findOne({
    dataId: getDataId(type, metadata)
  }).lean()) as TmpDataSchema<TmpDataType<T>> | null;
}

export function setTmpData<T extends TmpDataEnum>({
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
      upsert: true,
      new: true
    }
  );
}
