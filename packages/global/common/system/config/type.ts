import type { SystemConfigsTypeEnum } from './constants';
import type { z } from 'zod';
import type {
  SystemInstanceConfigUpdatedBySchema,
  SystemInstanceDomainDocumentSchema
} from './schema';

export type SystemConfigsType = {
  _id: string;
  type: `${SystemConfigsTypeEnum}`;
  value: Record<string, any>;
  createTime: Date;
};

export type DeepPartial<T> = T extends (...args: any[]) => any
  ? T
  : T extends Array<infer U>
    ? _DeepPartialArray<U>
    : T extends object
      ? _DeepPartialObject<T>
      : T | undefined;

type _DeepPartialArray<T> = Array<DeepPartial<T>>;
type _DeepPartialObject<T> = { [P in keyof T]?: DeepPartial<T[P]> };

export type SystemInstanceDomainDocumentType = z.infer<typeof SystemInstanceDomainDocumentSchema>;
export type SystemInstanceConfigUpdatedByType = z.infer<typeof SystemInstanceConfigUpdatedBySchema>;
export type SystemInstanceConfigActorType = SystemInstanceConfigUpdatedByType['actor'];
