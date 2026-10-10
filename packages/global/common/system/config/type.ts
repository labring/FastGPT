import type { SystemConfigsTypeEnum } from './constants';
import type { z } from 'zod';
import type {
  SystemInstanceConfigDomainKey,
  SystemInstanceConfigDomainMap,
  SystemInstanceConfigSchema,
  SystemInstanceConfigUpdatedBySchema,
  SystemInstanceDomainDocumentSchema
} from './schema';

export type { SystemInstanceConfigDomainKey, SystemInstanceConfigDomainMap };

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

export type SystemInstanceConfigType = z.infer<typeof SystemInstanceConfigSchema>;
export type SystemInstanceDomainDocumentType = z.infer<typeof SystemInstanceDomainDocumentSchema>;
export type SystemInstanceConfigDocumentType = SystemInstanceDomainDocumentType;
export type SystemInstanceConfigUpdatedByType = z.infer<typeof SystemInstanceConfigUpdatedBySchema>;
export type SystemInstanceConfigActorType = SystemInstanceConfigUpdatedByType['actor'];

export type SystemInstanceDomainOverridesType<
  T extends SystemInstanceConfigDomainKey = SystemInstanceConfigDomainKey
> = DeepPartial<SystemInstanceConfigDomainMap[T]>;

export type SystemInstanceDomainDocument<
  T extends SystemInstanceConfigDomainKey = SystemInstanceConfigDomainKey
> = {
  _id?: string;
  domain: T;
  schemaVersion: number;
  revision: number;
  overrides: SystemInstanceDomainOverridesType<T>;
  /** 使用方明确保存为内置默认值而被剪枝的叶子路径 */
  explicitDefaultPaths?: string[];
  updatedBy?: SystemInstanceConfigUpdatedByType;
  createdAt: Date;
  updatedAt: Date;
};
