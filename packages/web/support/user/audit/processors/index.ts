import { AuditEventEnum, type TeamAuditEvent } from '@fastgpt/global/support/user/audit/constants';
import { createTeamProcessors } from './teamProcessors';
import { createAppProcessors } from './appProcessors';
import { createDatasetAuditProcessors } from './datasetProcessors';
import { defaultMetadataProcessor, type CommonMetadataFields } from './commonProcessor';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';

type MetadataProcessor = (
  metadata: CommonMetadataFields,
  t: (key: string) => string,
  formatTime: (time: Date) => string
) => CommonMetadataFields;

const specialProcessors: Partial<Record<TeamAuditEvent, MetadataProcessor>> = {
  ...createTeamProcessors,
  ...createAppProcessors,
  ...createDatasetAuditProcessors,
  [AuditEventEnum.EXPORT_AUDIT_LOGS]: (metadata, t, formatTime) => {
    // 原始日志保留 ISO 时间；展示时使用页面本地时区或导出请求的时区。
    const formatBoundary = (value: unknown) => {
      if (typeof value !== 'string' || !value) return value;
      const date = new Date(value);
      return Number.isFinite(date.getTime()) ? formatTime(date) : value;
    };
    return {
      ...metadata,
      dateStart: formatBoundary(metadata.dateStart),
      dateEnd: formatBoundary(metadata.dateEnd),
      tmbIds: metadata.tmbIds === 'all' ? t('common:All') : metadata.tmbIds,
      events: metadata.events === 'all' ? t('common:All') : metadata.events,
      total: metadata.total === '' ? '-' : metadata.total
    };
  },
  // 用户名称保留原值，缺失父级的占位仅用于客户端展示。
  [AuditEventEnum.RESUME_INHERIT_PERMISSION]: (metadata) => ({
    ...metadata,
    parentResource: metadata.parentResource ?? '-'
  })
};

/**
 * 按事件选择完整的审计展示策略，未注册的事件使用通用处理器。
 * 时间默认按浏览器本地时区格式化；服务端调用需注入请求时区的 formatTime。
 * 特殊处理器接收原始 metadata，自行决定哪些字段需要翻译，避免提前改变用户名称或 URL。
 */
export const processAuditMetadata = ({
  event,
  metadata,
  t,
  formatTime = formatTime2YMDHMS
}: {
  event: TeamAuditEvent;
  metadata: CommonMetadataFields;
  t: (key: string) => string;
  formatTime?: (time: Date) => string;
}) => {
  const processor = specialProcessors[event] ?? defaultMetadataProcessor;
  return processor(metadata, t, formatTime);
};
