import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { Types } from '@fastgpt/service/common/mongo';
import {
  backfillSandboxInstanceTeamIdsBatch,
  readSandboxSourceTeams,
  type SandboxTeamIdRecord
} from './entity';

type SandboxTeamIdResolution = {
  record: SandboxTeamIdRecord;
} & ({ status: 'resolved'; teamId: string } | { status: 'orphan' | 'invalid' | 'invalidSourceId' });

/**
 * 批量解析来源团队，供回填和最终校验共用相同的分类规则。
 * 来源缺失或软删除为孤儿；坏 sourceId 和来源缺少 teamId 需管理员修复。
 * 查询异常直接传播，不能把暂时查询失败误判成孤儿。
 */
export const resolveSandboxTeamIdBatch = async (
  records: SandboxTeamIdRecord[]
): Promise<SandboxTeamIdResolution[]> => {
  const [apps, skills] = await Promise.all(
    ([ChatSourceTypeEnum.app, ChatSourceTypeEnum.skillEdit] as const).map((sourceType) =>
      readSandboxSourceTeams({
        sourceType,
        sourceIds: records
          .filter((record) => record.sourceType === sourceType)
          .map((record) => record.sourceId)
      })
    )
  );
  const appById = new Map(apps.map((doc) => [String(doc._id), doc]));
  const skillById = new Map(skills.map((doc) => [String(doc._id), doc]));

  return records.map((record) => {
    const sources = (() => {
      if (record.sourceType === ChatSourceTypeEnum.app) return appById;
      if (record.sourceType === ChatSourceTypeEnum.skillEdit) return skillById;
      return undefined;
    })();
    if (!sources) return { record, status: 'orphan' };
    if (!Types.ObjectId.isValid(record.sourceId)) return { record, status: 'invalidSourceId' };

    const source = sources.get(String(new Types.ObjectId(record.sourceId)));
    if (!source || source.deleteTime) return { record, status: 'orphan' };
    if (!source.teamId) return { record, status: 'invalid' };
    return { record, status: 'resolved', teamId: String(source.teamId) };
  });
};

/** CAS 批量回填可解析的归属，只补不覆盖；返回分类结果供编排维护失败快照。 */
export const backfillSandboxTeamIdBatch = async (records: SandboxTeamIdRecord[]) => {
  const outcomes = await resolveSandboxTeamIdBatch(records);
  await backfillSandboxInstanceTeamIdsBatch(
    outcomes.flatMap((outcome) =>
      outcome.status === 'resolved' ? [{ _id: outcome.record._id, teamId: outcome.teamId }] : []
    )
  );
  return outcomes;
};
