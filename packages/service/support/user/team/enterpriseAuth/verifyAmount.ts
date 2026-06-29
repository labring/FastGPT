import type { VerifyEnterpriseAuthAmountBodyType } from '@fastgpt/global/openapi/support/user/team/enterpriseAuth/api';
import { retryFn } from '@fastgpt/global/common/system/utils';
import type { ClientSession } from '../../../../common/mongo';
import {
  EnterpriseAuthAmountMaxErrorTimes,
  EnterpriseAuthErrEnum,
  TeamEnterpriseAuthStatusEnum,
  TeamEnterpriseAuthTaskStatusEnum
} from '@fastgpt/global/support/user/team/enterpriseAuth/constant';
import { mongoSessionRun } from '../../../../common/mongo/sessionRun';
import { getLogger, LogCategories } from '../../../../common/logger';
import { clearTeamPlanCache } from '../../../wallet/sub/utils';
import { assertEnterpriseAuthTaskOperator, enabledGuard, type AuthOperator } from './common';
import { MongoTeamEnterpriseAuth, MongoTeamEnterpriseAuthTask } from './schema';
import { expireCurrentTaskIfNeeded } from './taskExpire';
import { isPendingAmountTask, toTerminalTaskError } from './status';
import { grantEnterpriseAuthBenefit, lockAmountVerification, markVerified } from './grantTrial';

const logger = getLogger(LogCategories.MODULE.USER.TEAM);

const retryClearTeamPlanCache = ({ teamId, taskId }: { teamId: string; taskId: string }) => {
  void retryFn(() => clearTeamPlanCache(teamId), 2).catch((error) => {
    logger.warn('Failed to retry clearing team plan cache after enterprise auth verified', {
      teamId,
      taskId,
      error
    });
  });
};

const getVerifiedTaskResult = async ({
  teamId,
  taskId,
  amountFen,
  session
}: {
  teamId: string;
  taskId: string;
  amountFen: number;
  session?: ClientSession;
}) => {
  const query = MongoTeamEnterpriseAuthTask.findOne({
    teamId,
    taskId,
    status: TeamEnterpriseAuthTaskStatusEnum.verified,
    transferAmountFen: amountFen
  });
  if (session) {
    return query.session(session);
  }
  return query.lean();
};

/**
 * 金额验证失败路径只做金额错误次数原子递增，不进入权益发放事务。
 */
const verifyWrongAmount = async ({
  teamId,
  taskId,
  amountFen
}: {
  teamId: string;
  taskId: string;
  amountFen: number;
}) => {
  const now = new Date();
  const amountErrorBaseFilter = {
    teamId,
    taskId,
    status: {
      $in: [
        TeamEnterpriseAuthTaskStatusEnum.pending_amount,
        TeamEnterpriseAuthTaskStatusEnum.amount_failed
      ]
    },
    expireAt: { $gt: now },
    transferAmountFen: { $ne: amountFen }
  };

  /**
   * 金额错误次数必须在数据库内原子递增。
   * 最后一次错误需要和失败状态写入同一个 update，避免并发正确金额请求插入成功。
   */
  const markFinalAmountFailed = () =>
    MongoTeamEnterpriseAuthTask.findOneAndUpdate(
      {
        ...amountErrorBaseFilter,
        amountErrorTimes: {
          $gte: EnterpriseAuthAmountMaxErrorTimes - 1,
          $lt: EnterpriseAuthAmountMaxErrorTimes
        }
      },
      {
        $inc: {
          amountErrorTimes: 1
        },
        $set: {
          status: TeamEnterpriseAuthTaskStatusEnum.failed,
          endedAt: now,
          lastErrorCode: EnterpriseAuthErrEnum.amountFailed,
          lastErrorMessage: '验证金额错误次数已达上限，本次认证失败',
          updateTime: now
        }
      },
      { new: true }
    ).lean();

  const markRecoverableAmountError = () =>
    MongoTeamEnterpriseAuthTask.findOneAndUpdate(
      {
        ...amountErrorBaseFilter,
        amountErrorTimes: {
          $lt: EnterpriseAuthAmountMaxErrorTimes - 1
        }
      },
      {
        $inc: {
          amountErrorTimes: 1
        },
        $set: {
          status: TeamEnterpriseAuthTaskStatusEnum.amount_failed,
          lastErrorCode: EnterpriseAuthErrEnum.amountError,
          lastErrorMessage: '验证金额错误',
          updateTime: now
        }
      },
      { new: true }
    ).lean();

  const finalFailedAuth = await markFinalAmountFailed();
  if (finalFailedAuth) {
    throw new Error(EnterpriseAuthErrEnum.amountFailed);
  }

  const recoverableFailedAuth = await markRecoverableAmountError();
  if (recoverableFailedAuth) {
    throw new Error(EnterpriseAuthErrEnum.amountError);
  }

  // 并发请求可能在第一次最终失败检查后，把错误次数推进到最后一次阈值。
  const retryFinalFailedAuth = await markFinalAmountFailed();
  if (retryFinalFailedAuth) {
    throw new Error(EnterpriseAuthErrEnum.amountFailed);
  }

  const latest = await MongoTeamEnterpriseAuthTask.findOne({
    teamId,
    taskId
  }).lean();

  if (
    (latest?.amountErrorTimes ?? 0) >= EnterpriseAuthAmountMaxErrorTimes ||
    latest?.status === TeamEnterpriseAuthTaskStatusEnum.failed
  ) {
    throw new Error(EnterpriseAuthErrEnum.amountFailed);
  }

  throw new Error(EnterpriseAuthErrEnum.taskNotFound);
};

/**
 * 认证成功应用服务：金额锁定 -> 套餐/积分发放 -> 成功信息落库。
 *
 * 全流程在同一个 Mongo 事务内完成。飞书同步已移除，外部运营系统不会影响认证权益发放。
 */
export const verifyEnterpriseAuthAmount = async ({
  operator,
  data
}: {
  operator: AuthOperator;
  data: VerifyEnterpriseAuthAmountBodyType;
}) => {
  enabledGuard();

  const task =
    (await expireCurrentTaskIfNeeded(operator.teamId)) ||
    (await MongoTeamEnterpriseAuthTask.findOne({
      teamId: operator.teamId,
      taskId: data.taskId
    }).lean());
  if (!task) {
    const [verifiedAuth, verifiedTask] = await Promise.all([
      MongoTeamEnterpriseAuth.findOne({ teamId: operator.teamId }).lean(),
      getVerifiedTaskResult({
        teamId: operator.teamId,
        taskId: data.taskId,
        amountFen: data.amountFen
      })
    ]);
    if (verifiedAuth && verifiedTask) {
      return {
        status: TeamEnterpriseAuthStatusEnum.verified,
        verifiedEnterpriseName: verifiedAuth.enterpriseName,
        grantExpiredAt: verifiedTask.grantExpiredAt,
        amountMaxErrorTimes: EnterpriseAuthAmountMaxErrorTimes
      };
    }
    throw new Error(EnterpriseAuthErrEnum.taskNotFound);
  }
  if (task.taskId === data.taskId) {
    assertEnterpriseAuthTaskOperator({ task, operator });

    const terminalError = toTerminalTaskError(task);
    if (terminalError) throw new Error(terminalError);

    if (
      task.status === TeamEnterpriseAuthTaskStatusEnum.verified &&
      task.transferAmountFen === data.amountFen
    ) {
      const verifiedAuth = await MongoTeamEnterpriseAuth.findOne({
        teamId: operator.teamId
      }).lean();
      if (verifiedAuth) {
        return {
          status: TeamEnterpriseAuthStatusEnum.verified,
          verifiedEnterpriseName: verifiedAuth.enterpriseName,
          grantExpiredAt: task.grantExpiredAt,
          amountMaxErrorTimes: EnterpriseAuthAmountMaxErrorTimes
        };
      }
    }
  }

  if (!isPendingAmountTask(task) || !task.expireAt || task.taskId !== data.taskId) {
    throw new Error(EnterpriseAuthErrEnum.taskNotFound);
  }

  if (task.transferAmountFen !== data.amountFen) {
    await verifyWrongAmount({
      teamId: operator.teamId,
      taskId: data.taskId,
      amountFen: data.amountFen
    });
  }

  const { auth: verifiedAuth, grantExpiredAt } = await mongoSessionRun(async (session) => {
    const now = new Date();
    const locking = await lockAmountVerification({
      teamId: operator.teamId,
      taskId: data.taskId,
      amountFen: data.amountFen,
      now,
      session
    });

    if (!locking) {
      const [latestAuth, latestTask] = await Promise.all([
        MongoTeamEnterpriseAuth.findOne({ teamId: operator.teamId }).session(session),
        MongoTeamEnterpriseAuthTask.findOne({
          teamId: operator.teamId,
          taskId: data.taskId
        }).session(session)
      ]);
      if (
        latestAuth &&
        latestTask?.status === TeamEnterpriseAuthTaskStatusEnum.verified &&
        latestTask.transferAmountFen === data.amountFen
      ) {
        return { auth: latestAuth, grantExpiredAt: latestTask.grantExpiredAt };
      }
      throw new Error(EnterpriseAuthErrEnum.processing);
    }

    const grantedAt = now;
    const advancedSub = await grantEnterpriseAuthBenefit({
      teamId: operator.teamId,
      grantedAt,
      session
    });

    const verified = await markVerified({
      operator,
      taskId: data.taskId,
      grantedAt,
      grantExpiredAt: advancedSub.expiredTime,
      bankAccount: locking.bankAccount,
      session
    });

    if (!verified) {
      throw new Error(EnterpriseAuthErrEnum.processing);
    }

    const auth = await MongoTeamEnterpriseAuth.findOne({ teamId: operator.teamId }).session(
      session
    );
    if (!auth) {
      throw new Error(EnterpriseAuthErrEnum.processing);
    }

    return { auth, grantExpiredAt: advancedSub.expiredTime };
  });

  try {
    await clearTeamPlanCache(operator.teamId);
  } catch (error) {
    logger.warn('Failed to clear team plan cache after enterprise auth verified', {
      teamId: operator.teamId,
      taskId: data.taskId,
      error
    });
    retryClearTeamPlanCache({
      teamId: operator.teamId,
      taskId: data.taskId
    });
  }

  return {
    status: TeamEnterpriseAuthStatusEnum.verified,
    verifiedEnterpriseName: verifiedAuth.enterpriseName,
    grantExpiredAt,
    amountMaxErrorTimes: EnterpriseAuthAmountMaxErrorTimes
  };
};
