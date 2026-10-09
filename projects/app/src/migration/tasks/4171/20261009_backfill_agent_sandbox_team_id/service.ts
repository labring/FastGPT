/**
 * 迁移专属数据访问：从 App/Skill 源解析团队归属，并经 sandbox 迁移接口回填 teamId。
 *
 * 实例记录的读取/回填统一走 `interface/migration`（架构约束：外部只能经 interface/* 访问
 * sandbox）；源解析与失败分类属于本任务逻辑，保留在任务目录内。
 */
import type { Collection } from 'mongoose';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import {
  backfillSandboxInstanceTeamIdsBatch,
  type SandboxInstanceMissingTeamIdRecord
} from '@fastgpt/service/core/ai/sandbox/interface/migration';

export type SandboxTeamIdRecord = SandboxInstanceMissingTeamIdRecord;

export type SandboxTeamIdBackfillOutcome = {
  recordId: string;
  /** migrated=已解析并尝试回填；orphan=源缺失/软删除；invalid=缺 teamId；invalidSourceId=源 ID 无效。 */
  status: 'migrated' | 'orphan' | 'invalid' | 'invalidSourceId';
};

export {
  countSandboxInstancesMissingTeamId as countMissingTeamId,
  findSandboxInstanceMissingTeamId as readSandboxTeamIdRecord,
  getSandboxInstanceMissingTeamIdSnapshotEnd as getSandboxTeamIdSnapshotEnd,
  readSandboxInstancesMissingTeamId as readSandboxTeamIdBatch
} from '@fastgpt/service/core/ai/sandbox/interface/migration';

type SourceDoc = { _id: Types.ObjectId; teamId?: unknown; deleteTime?: unknown };
type SourceTeamResolution = { teamId: string } | 'invalid' | 'orphan';

const resolveDocTeamResolution = (doc: SourceDoc): SourceTeamResolution =>
  doc.deleteTime ? 'orphan' : doc.teamId ? { teamId: String(doc.teamId) } : 'invalid';

/** 按 sourceType 批量解析有效 ID 的源团队归属；无效 ID 留给批次逐条报告。 */
const resolveSourceTeamIds = async (
  sourceType: string,
  sourceIds: string[]
): Promise<Map<string, SourceTeamResolution>> => {
  // 坏 ID 由批次逐条报告，不能让 ObjectId 构造失败阻断同批正常数据。
  const validSourceIds = sourceIds.filter((id) => Types.ObjectId.isValid(id));
  if (validSourceIds.length === 0) return new Map();
  const collection: Collection<SourceDoc> =
    sourceType === ChatSourceTypeEnum.app
      ? (MongoApp.collection as unknown as Collection<SourceDoc>)
      : (MongoAgentSkills.collection as unknown as Collection<SourceDoc>);
  const docs = await collection
    .find(
      { _id: { $in: validSourceIds.map((id) => new Types.ObjectId(id)) } },
      { projection: { _id: 1, teamId: 1, deleteTime: 1 } }
    )
    .toArray();
  return new Map(docs.map((doc) => [String(doc._id), resolveDocTeamResolution(doc)] as const));
};

/**
 * 解析并回填一批记录的团队归属。
 *
 * 每批按 sourceType 分组做一次 `$in` 查询；写入由 sandbox 迁移接口以 CAS bulkWrite 完成，
 * 只补不覆写：并发业务写入或重放都不会覆盖已有归属。孤儿记录不产生写入也不计失败；
 * 无效 sourceId 返回独立失败结局，不阻断同批正常记录回填。
 */
export const backfillSandboxTeamIdBatch = async (
  records: SandboxTeamIdRecord[]
): Promise<SandboxTeamIdBackfillOutcome[]> => {
  const appIds = records
    .filter((record) => record.sourceType === ChatSourceTypeEnum.app)
    .map((record) => record.sourceId);
  const skillIds = records
    .filter((record) => record.sourceType === ChatSourceTypeEnum.skillEdit)
    .map((record) => record.sourceId);
  const [appTeams, skillTeams] = await Promise.all([
    resolveSourceTeamIds(ChatSourceTypeEnum.app, appIds),
    resolveSourceTeamIds(ChatSourceTypeEnum.skillEdit, skillIds)
  ]);

  const outcomes: SandboxTeamIdBackfillOutcome[] = [];
  const writes: Array<{ _id: Types.ObjectId; teamId: string }> = [];

  for (const record of records) {
    const recordId = String(record._id);
    if (
      (record.sourceType === ChatSourceTypeEnum.app ||
        record.sourceType === ChatSourceTypeEnum.skillEdit) &&
      !Types.ObjectId.isValid(record.sourceId)
    ) {
      outcomes.push({ recordId, status: 'invalidSourceId' });
      continue;
    }
    const resolution =
      record.sourceType === ChatSourceTypeEnum.app
        ? appTeams.get(record.sourceId)
        : record.sourceType === ChatSourceTypeEnum.skillEdit
          ? skillTeams.get(record.sourceId)
          : undefined;

    if (resolution === 'invalid') {
      outcomes.push({ recordId, status: 'invalid' });
      continue;
    }
    if (!resolution || resolution === 'orphan') {
      outcomes.push({ recordId, status: 'orphan' });
      continue;
    }
    writes.push({ _id: record._id, teamId: resolution.teamId });
    outcomes.push({ recordId, status: 'migrated' });
  }

  await backfillSandboxInstanceTeamIdsBatch(writes);
  return outcomes;
};
