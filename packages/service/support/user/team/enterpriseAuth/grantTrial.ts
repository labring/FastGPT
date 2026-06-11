import { addDays } from 'date-fns';
import {
  EnterpriseAuthGrantPoints,
  EnterpriseAuthTrialDays,
  TeamEnterpriseAuthTaskStatusEnum
} from '@fastgpt/global/support/user/team/enterpriseAuth/constant';
import {
  StandardSubLevelEnum,
  SubModeEnum,
  SubTypeEnum,
  standardSubLevelMap
} from '@fastgpt/global/support/wallet/sub/constants';
import type { ClientSession } from '../../../../common/mongo';
import { MongoTeamSub } from '../../../wallet/sub/schema';
import { reComputeStandPlans } from '../../../wallet/sub/utils';
import { MongoTeamEnterpriseAuth, MongoTeamEnterpriseAuthTask } from './schema';
import { toObjectId, type AuthOperator } from './common';

/**
 * 企业认证成功后赠送 15 天高级版套餐和 25000 积分。
 *
 * 发放高级版后会重排未过期标准套餐，确保低等级套餐的生效时间接到高级版之后；
 * 当前定制版或更高等级套餐继续优先生效，赠送高级版接到该高等级套餐过期后。
 */
export const grantEnterpriseAuthBenefit = async ({
  teamId,
  grantedAt,
  session
}: {
  teamId: string;
  grantedAt: Date;
  session: ClientSession;
}) => {
  let teamSub = await MongoTeamSub.findOne({
    teamId,
    type: SubTypeEnum.standard,
    currentSubLevel: StandardSubLevelEnum.advanced
  }).session(session);
  const activeStandardPlans = await MongoTeamSub.find({
    teamId,
    type: SubTypeEnum.standard,
    startTime: { $lte: grantedAt },
    expiredTime: { $gt: grantedAt }
  }).session(session);
  activeStandardPlans.sort(
    (a, b) =>
      standardSubLevelMap[b.currentSubLevel].weight - standardSubLevelMap[a.currentSubLevel].weight
  );

  const highestActivePlan = activeStandardPlans[0];
  const advancedWeight = standardSubLevelMap[StandardSubLevelEnum.advanced].weight;
  const highestActiveWeight = highestActivePlan
    ? standardSubLevelMap[highestActivePlan.currentSubLevel].weight
    : 0;
  const grantStartAt =
    highestActivePlan && highestActiveWeight > advancedWeight
      ? highestActivePlan.expiredTime
      : grantedAt;

  if (teamSub) {
    teamSub.totalPoints = (teamSub.totalPoints || 0) + EnterpriseAuthGrantPoints;
    teamSub.surplusPoints = (teamSub.surplusPoints || 0) + EnterpriseAuthGrantPoints;

    if (teamSub.expiredTime.getTime() <= grantStartAt.getTime()) {
      teamSub.startTime = grantStartAt;
      teamSub.expiredTime = addDays(grantStartAt, EnterpriseAuthTrialDays);
    } else {
      if (teamSub.startTime.getTime() > grantStartAt.getTime()) {
        teamSub.startTime = grantStartAt;
      }
      teamSub.expiredTime = addDays(teamSub.expiredTime, EnterpriseAuthTrialDays);
    }
    await teamSub.save({ session });
  } else {
    const [created] = await MongoTeamSub.create(
      [
        {
          teamId,
          type: SubTypeEnum.standard,
          startTime: grantStartAt,
          expiredTime: addDays(grantStartAt, EnterpriseAuthTrialDays),
          currentMode: SubModeEnum.month,
          nextMode: SubModeEnum.month,
          currentSubLevel: StandardSubLevelEnum.advanced,
          nextSubLevel: StandardSubLevelEnum.advanced,
          totalPoints: EnterpriseAuthGrantPoints,
          surplusPoints: EnterpriseAuthGrantPoints
        }
      ],
      { session }
    );
    teamSub = created;
  }

  await reComputeStandPlans(teamId, session);

  return teamSub;
};

export const lockAmountVerification = async ({
  teamId,
  taskId,
  amountFen,
  now,
  session
}: {
  teamId: string;
  taskId: string;
  amountFen: number;
  now: Date;
  session: ClientSession;
}) => {
  const locking = await MongoTeamEnterpriseAuthTask.findOneAndUpdate(
    {
      teamId,
      taskId,
      status: {
        $in: [
          TeamEnterpriseAuthTaskStatusEnum.pending_amount,
          TeamEnterpriseAuthTaskStatusEnum.amount_failed
        ]
      },
      expireAt: { $gt: now },
      transferAmountFen: amountFen
    },
    {
      $set: {
        status: TeamEnterpriseAuthTaskStatusEnum.granting,
        updateTime: now
      }
    },
    {
      new: true,
      session
    }
  );

  return locking;
};

/**
 * 将认证成功结果同时落入最终信息表和任务历史表。
 *
 * 最终信息表只保存完整企业认证快照；任务表只保存流程状态，权益以团队套餐表为准。
 * 认证次数已在认证服务返回成功、进入金额验证页时消耗；金额验证成功只负责最终落库和发放权益。
 */
export const markVerified = async ({
  operator,
  taskId,
  grantedAt,
  grantExpiredAt,
  bankAccount,
  session
}: {
  operator: AuthOperator;
  taskId: string;
  grantedAt: Date;
  grantExpiredAt: Date;
  bankAccount: string;
  session: ClientSession;
}) => {
  const task = await MongoTeamEnterpriseAuthTask.findOne({
    teamId: operator.teamId,
    taskId,
    status: TeamEnterpriseAuthTaskStatusEnum.granting
  })
    .session(session)
    .lean();

  if (!task) return;

  await MongoTeamEnterpriseAuth.create(
    [
      {
        teamId: toObjectId(operator.teamId),
        enterpriseName: task.enterpriseName,
        unifiedCreditCode: task.unifiedCreditCode,
        legalPersonName: task.legalPersonName,
        bankName: task.bankName,
        bankAccount,
        contactName: task.contactName,
        contactTitle: task.contactTitle,
        contactPhone: task.contactPhone,
        demand: task.demand,
        verifiedAt: grantedAt,
        createTime: grantedAt,
        updateTime: grantedAt
      }
    ],
    { session }
  );

  return MongoTeamEnterpriseAuthTask.findOneAndUpdate(
    {
      teamId: operator.teamId,
      taskId,
      status: TeamEnterpriseAuthTaskStatusEnum.granting
    },
    {
      $set: {
        status: TeamEnterpriseAuthTaskStatusEnum.verified,
        grantExpiredAt,
        endedAt: grantedAt,
        updateTime: grantedAt
      }
    },
    {
      new: true,
      session
    }
  );
};
