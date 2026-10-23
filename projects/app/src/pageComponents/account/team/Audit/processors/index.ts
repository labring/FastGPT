import { AuditEventEnum, type TeamAuditEvent } from '@fastgpt/global/support/user/audit/constants';
import { createTeamProcessors } from './teamProcessors';
import { createAppProcessors } from './appProcessors';
import { createDatasetAuditProcessors } from '../dataset/audit';
import { defaultMetadataProcessor, type CommonMetadataFields } from './commonProcessor';

type MetadataProcessor = (
  metadata: CommonMetadataFields,
  t: (key: string) => string
) => CommonMetadataFields;

const specialProcessors: Partial<Record<TeamAuditEvent, MetadataProcessor>> = {
  ...createTeamProcessors,
  ...createAppProcessors,
  ...createDatasetAuditProcessors,
  // 用户名称保留原值，缺失父级的占位仅用于客户端展示。
  [AuditEventEnum.RESUME_INHERIT_PERMISSION]: (metadata) => ({
    ...metadata,
    parentResource: metadata.parentResource ?? '-'
  })
};

/**
 * 按事件选择完整的审计展示策略，未注册的事件使用通用处理器。
 * 特殊处理器接收原始 metadata，自行决定哪些字段需要翻译，避免提前改变用户名称或 URL。
 */
export const processAuditMetadata = ({
  event,
  metadata,
  t
}: {
  event: TeamAuditEvent;
  metadata: CommonMetadataFields;
  t: (key: string) => string;
}) => {
  const processor = specialProcessors[event] ?? defaultMetadataProcessor;
  return processor(metadata, t);
};
