import type { Processor } from 'bullmq';
import { type TeamDeleteJobData } from './index';
import { MongoImage } from '../../../../common/file/image/schema';
import { MongoApp } from '../../../../core/app/schema';
import { MongoDataset } from '../../../../core/dataset/schema';
import { MongoOpenApi } from '../../../openapi/schema';
import { MongoGroupMemberModel } from '../../../permission/memberGroup/groupMemberSchema';
import { MongoMemberGroupModel } from '../../../permission/memberGroup/memberGroupSchema';
import { MongoOrgMemberModel } from '../../../permission/org/orgMemberSchema';
import { MongoOrgModel } from '../../../permission/org/orgSchema';
import { MongoResourcePermission } from '../../../permission/schema';
import { migrateUserSessionsFromTeam } from '../../session';
import { MongoTeamMember } from '../teamMemberSchema';
import { MongoTeam } from '../teamSchema';
import { MongoMcpKey } from '../../../mcp/schema';
import { MongoChatSetting } from '../../../../core/chat/setting/schema';
import { MongoChatFavouriteApp } from '../../../../core/chat/favouriteApp/schema';
import { MongoDiscountCoupon } from '../../../wallet/discountCoupon/schema';
import { MongoTeamAudit } from '../../audit/schema';
import { deleteTeamAllDatasets } from '../../../../core/dataset/delete/processor';
import { onDelAllApp } from './utils';
import { deleteEvaluationsByTeamId } from '../../../../core/app/evaluation/delete';
import { MongoTeamSub } from '../../../../support/wallet/sub/schema';
import { getLogger, LogCategories } from '../../../../common/logger';
import { getUserFallbackTeam } from '../fallback';
import { MongoUser } from '../../schema';
import { withAccountCancellationTeamLock } from '../../account/cancellation';
import { MongoOutLink } from '../../../outLink/schema';

const logger = getLogger(LogCategories.MODULE.USER.TEAM);

export const teamDeleteProcessor: Processor<TeamDeleteJobData> = async (job) =>
  withAccountCancellationTeamLock(job.data.teamId, async () => {
    const { teamId } = job.data;
    const startTime = Date.now();

    // App/Dataset 使用独立队列删除，这类残留在 team-delete 重试耗尽前不应升级为 ERR。
    class TeamResourcesStillDeletingError extends Error {
      constructor(
        readonly remainingApps: number,
        readonly remainingDatasets: number
      ) {
        super('Team resources are still being deleted');
      }
    }

    if (job.attemptsMade === 0) {
      logger.info('Team delete started', { teamId });
    }

    try {
      // 1. 检查团队是否存在
      const team = await MongoTeam.findById(teamId);
      if (!team) {
        logger.warn('Team not found for deletion', { teamId });
        return;
      }

      // 2. 先删除知识库和应用（它们内部有自己的队列）
      await deleteTeamAllDatasets(teamId);
      await onDelAllApp(teamId);
      await deleteEvaluationsByTeamId(teamId);

      // 删除图片(旧的了)
      await MongoImage.deleteMany({
        teamId: teamId
      });

      // 3. 删除门户
      await MongoChatSetting.deleteMany({
        teamId
      });
      await MongoChatFavouriteApp.deleteMany({
        teamId
      });

      // 4. 删除独立资源
      // 删除 API key
      await MongoOpenApi.deleteMany({
        teamId
      });
      // 分享链接直接绑定团队；不能只依赖 app delete 队列清理，避免队列延迟期间继续可访问。
      await MongoOutLink.deleteMany({
        teamId
      });
      // 删除 MCP
      await MongoMcpKey.deleteMany({
        teamId
      });
      // 审计日志
      await MongoTeamAudit.deleteMany({
        teamId
      });

      // 5. 删除财务相关
      // 删除优惠券
      await MongoDiscountCoupon.deleteMany({
        teamId
      });

      await MongoTeamSub.deleteMany({
        teamId
      });
      // 删除使用记录（不删除，等待自动过期）
      // 充值记录不删除

      const [remainingApps, remainingDatasets] = await Promise.all([
        MongoApp.countDocuments({ teamId }),
        MongoDataset.countDocuments({ teamId })
      ]);
      if (remainingApps > 0 || remainingDatasets > 0) {
        // App/Dataset worker 必须先完成，否则删除团队后 finalizer 无法再按 teamId 观察残留。
        throw new TeamResourcesStillDeletingError(remainingApps, remainingDatasets);
      }

      // 6. 删除团队信息
      // 删除权限
      await MongoResourcePermission.deleteMany({
        teamId
      });

      // 删除群组
      const groups = await MongoMemberGroupModel.find({ teamId });
      await MongoGroupMemberModel.deleteMany({
        groupId: { $in: groups.map((item) => item._id) }
      });
      await MongoMemberGroupModel.deleteMany({
        teamId
      });

      // 删除组织
      await MongoOrgModel.deleteMany({
        teamId
      });
      await MongoOrgMemberModel.deleteMany({
        teamId
      });

      // 7. 删除成员 session 和成员信息
      const members = await MongoTeamMember.find({
        teamId
      });

      // 仅迁移/删除指向本团队的会话，保留成员在其它团队的登录态。
      await Promise.all(
        members.map(async (member) => {
          try {
            const fallback = await getUserFallbackTeam({
              userId: String(member.userId),
              excludedTeamId: teamId
            });
            await migrateUserSessionsFromTeam({
              userId: String(member.userId),
              deletedTeamId: teamId,
              fallback: fallback ?? undefined
            });
            await MongoUser.updateOne(
              { _id: member.userId, lastLoginTmbId: member._id },
              fallback
                ? { $set: { lastLoginTmbId: fallback.tmbId } }
                : { $unset: { lastLoginTmbId: 1 } }
            );
          } catch (error) {
            // Session 迁移失败不阻塞团队删除；旧会话由下次鉴权的 fallback 收口。
            logger.warn('Team delete session fallback failed', {
              teamId,
              userId: String(member.userId),
              error
            });
          }
        })
      );

      await MongoTeamMember.deleteMany({
        teamId
      });

      // 8. 清理团队敏感信息
      team.notificationAccount = '';
      team.openaiAccount = undefined;
      team.externalWorkflowVariables = undefined;
      team.meta = undefined;
      await team.save();

      await MongoTeam.deleteOne({ _id: teamId });

      logger.info('Team delete completed', {
        teamId,
        durationMs: Date.now() - startTime
      });
    } catch (error) {
      const maxAttempts = job.opts.attempts ?? 1;
      const isFinalAttempt = job.attemptsMade + 1 >= maxAttempts;
      if (error instanceof TeamResourcesStillDeletingError) {
        if (isFinalAttempt) {
          logger.error('Team delete failed after retries', {
            teamId,
            attempts: maxAttempts,
            remainingApps: error.remainingApps,
            remainingDatasets: error.remainingDatasets
          });
        }
        throw error;
      }

      logger.error('Team delete failed', { teamId, error });
      throw error;
    }
  });
