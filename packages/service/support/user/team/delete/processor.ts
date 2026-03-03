import type { Processor } from 'bullmq';
import { type TeamDeleteJobData } from './index';
import { addLog } from '../../../../common/system/log';
import { MongoImage } from '../../../../common/file/image/schema';
import { MongoOpenApi } from '../../../openapi/schema';
import { MongoGroupMemberModel } from '../../../permission/memberGroup/groupMemberSchema';
import { MongoMemberGroupModel } from '../../../permission/memberGroup/memberGroupSchema';
import { MongoOrgMemberModel } from '../../../permission/org/orgMemberSchema';
import { MongoOrgModel } from '../../../permission/org/orgSchema';
import { MongoResourcePermission } from '../../../permission/schema';
import { delUserAllSession } from '../../session';
import { MongoTeamMember } from '../teamMemberSchema';
import { MongoTeam } from '../teamSchema';
import { MongoTeamTags } from '../teamTagsSchema';
import { MongoMcpKey } from '../../../mcp/schema';
import { MongoChatSetting } from '../../../../core/chat/setting/schema';
import { MongoChatFavouriteApp } from '../../../../core/chat/favouriteApp/schema';
import { MongoDiscountCoupon } from '../../../wallet/discountCoupon/schema';
import { MongoTeamAudit } from '../../audit/schema';
import { deleteTeamAllDatasets } from '../../../../core/dataset/delete/processor';
import { onDelAllApp } from './utils';
import { MongoEvaluation } from '../../../../core/app/evaluation/evalSchema';
import { MongoEvalItem } from '../../../../core/app/evaluation/evalItemSchema';
import { MongoTeamSub } from '../../../../support/wallet/sub/schema';

export const teamDeleteProcessor: Processor<TeamDeleteJobData> = async (job) => {
  const { teamId } = job.data;
  const startTime = Date.now();

  addLog.info(`[Team Delete] Start deleting team: ${teamId}`);

  try {
    // 1. 检查团队是否存在
    const team = await MongoTeam.findById(teamId);
    if (!team) {
      addLog.warn(`[Team Delete] Team not found: ${teamId}`);
      return;
    }

    // 2. 先删除知识库和应用（它们内部有自己的队列）
    await deleteTeamAllDatasets(teamId);
    await onDelAllApp(teamId);
    // 删除评估
    await MongoEvaluation.deleteMany({
      teamId
    });
    // 删除评估项
    await MongoEvalItem.deleteMany({
      teamId
    });

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

    // 删除 teamTags
    await MongoTeamTags.deleteMany({
      teamId
    });

    // 7. 删除成员 session 和成员信息
    const members = await MongoTeamMember.find({
      teamId
    });

    // 删除所有成员的 session
    await Promise.all(members.map((member) => delUserAllSession(member.userId)));

    await MongoTeamMember.deleteMany({
      teamId
    });

    // 8. 清理团队敏感信息
    team.notificationAccount = '';
    team.openaiAccount = undefined;
    team.lafAccount = undefined;
    team.externalWorkflowVariables = undefined;
    team.meta = undefined;
    await team.save();

    addLog.info(`[Team Delete] Successfully deleted team: ${teamId}`, {
      duration: Date.now() - startTime
    });
  } catch (error: any) {
    addLog.error(`[Team Delete] Failed to delete team: ${teamId}`, error);
    throw error;
  }
};
