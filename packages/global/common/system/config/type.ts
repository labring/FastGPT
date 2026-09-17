import type { SystemConfigsTypeEnum } from './constants';
import type { z } from 'zod';
import type {
  SystemInstanceConfigDocumentSchema,
  SystemInstanceConfigSchema,
  SystemInstanceConfigUpdatedBySchema
} from './schema';

export type SystemConfigsType = {
  _id: string;
  type: `${SystemConfigsTypeEnum}`;
  value: Record<string, any>;
  createTime: Date;
};

export type SystemInstanceConfigType = z.infer<typeof SystemInstanceConfigSchema>;
export type SystemInstanceConfigDocumentType = z.infer<typeof SystemInstanceConfigDocumentSchema>;
export type SystemInstanceConfigUpdatedByType = z.infer<typeof SystemInstanceConfigUpdatedBySchema>;
export type SystemInstanceConfigActorType = SystemInstanceConfigUpdatedByType['actor'];
