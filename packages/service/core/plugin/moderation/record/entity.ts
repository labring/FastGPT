import { MongoSystemModerationRecord } from './schema';
import type { ClientSession } from '../../../../common/mongo';
import type {
  ModerationActionEnum,
  ModerationStageEnum
} from '@fastgpt/global/core/plugin/moderation/constants';
import type { ModerationRecordType } from '@fastgpt/global/core/plugin/moderation/type';
import { getLogger, LogCategories } from '../../../../common/logger';

const logger = getLogger(LogCategories.INFRA.MONGO);

export type RecordModerationEventParams = Omit<ModerationRecordType, '_id' | 'createTime'>;

export type FindModerationRecordsQuery = {
  teamId?: string;
  appId?: string;
  stage?: `${ModerationStageEnum}` | ModerationStageEnum;
  verdict?: 'pass' | 'suspected' | 'block' | 'error';
  actionTaken?: `${ModerationActionEnum}` | ModerationActionEnum;
  startTime?: Date;
  endTime?: Date;
  offset?: number;
  limit?: number;
};

/**
 * 插入单条内容审查审计记录
 */
export const createModerationRecord = async (
  params: RecordModerationEventParams,
  session?: ClientSession
): Promise<ModerationRecordType> => {
  const [record] = await MongoSystemModerationRecord.create(
    [
      {
        ...params,
        createTime: new Date()
      }
    ],
    { session }
  );

  return record.toObject();
};

/**
 * 异步静默记录审查事件
 *
 * 采用静默落库原则，内部捕获所有持久化异常并通过 logger 告警，绝不中断或抛出异常影响业务链路。
 */
export const recordModerationEvent = async (
  params: RecordModerationEventParams,
  session?: ClientSession
): Promise<void> => {
  try {
    await createModerationRecord(params, session);
  } catch (error) {
    logger.error('Failed to asynchronously persist moderation record', {
      error,
      stage: params.stage,
      targetField: params.targetField,
      pluginId: params.pluginId
    });
  }
};

/**
 * 查询内容审查记录列表（支持过滤与分页，按时间倒序）
 */
export const findModerationRecords = async ({
  teamId,
  appId,
  stage,
  verdict,
  actionTaken,
  startTime,
  endTime,
  offset = 0,
  limit = 20
}: FindModerationRecordsQuery = {}): Promise<{
  total: number;
  list: ModerationRecordType[];
}> => {
  const match: Record<string, unknown> = {};

  if (teamId) match.teamId = teamId;
  if (appId) match.appId = appId;
  if (stage) match.stage = stage;
  if (verdict) match.verdict = verdict;
  if (actionTaken) match.actionTaken = actionTaken;

  if (startTime || endTime) {
    match.createTime = {
      ...(startTime ? { $gte: startTime } : {}),
      ...(endTime ? { $lte: endTime } : {})
    };
  }

  const [total, list] = await Promise.all([
    MongoSystemModerationRecord.countDocuments(match),
    MongoSystemModerationRecord.find(match)
      .sort({ createTime: -1 })
      .skip(offset)
      .limit(limit)
      .lean<ModerationRecordType[]>()
  ]);

  return { total, list };
};
