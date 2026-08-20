import type { TmpDataEnum } from '@fastgpt/global/support/tmpData/constants';
import {
  TmpDataExpireTime,
  type TmpDataMetadata,
  type TmpDataType
} from '@fastgpt/global/support/tmpData/constants';
import { tmpDataRepository } from '../../common/dal';
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
  return (await tmpDataRepository.findByDataId(getDataId(type, metadata))) as TmpDataSchema<
    TmpDataType<T>
  > | null;
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
  return tmpDataRepository.upsert({
    dataId: getDataId(type, metadata),
    data,
    expireAt: addMilliseconds(Date.now(), TmpDataExpireTime[type])
  });
}
