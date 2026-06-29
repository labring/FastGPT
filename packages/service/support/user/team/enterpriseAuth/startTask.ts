import { addDays } from 'date-fns';
import type { StartEnterpriseAuthBodyType } from '@fastgpt/global/openapi/support/user/team/enterpriseAuth/api';
import {
  EnterpriseAuthErrEnum,
  EnterpriseAuthMaxTimes,
  EnterpriseAuthTrialDays,
  TeamEnterpriseAuthStatusEnum,
  TeamEnterpriseAuthTaskStatusEnum
} from '@fastgpt/global/support/user/team/enterpriseAuth/constant';
import {
  assertEnterpriseAuthTaskOperator,
  type AuthOperator,
  createEnterpriseAuthTaskId,
  enabledGuard,
  isEnterpriseAuthTimesExhausted,
  isMongoDuplicateKeyError,
  normalizeBankAccount,
  normalizeUnifiedCreditCode,
  pendingTaskStatuses,
  serviceConfigGuard,
  toObjectId
} from './common';
import { MongoTeamEnterpriseAuth, MongoTeamEnterpriseAuthTask } from './schema';
import { createEnterpriseAuthTransfer } from './transferClient';
import { buildLightTask } from './status';
import {
  expireActiveUnifiedCreditCodeLocksIfNeeded,
  expireCurrentTaskIfNeeded
} from './taskExpire';

const getTeamEnterpriseAuthTask = (teamId: string) =>
  MongoTeamEnterpriseAuthTask.findOne({ teamId }).lean();

const getCurrentEnterpriseAuthTask = async (teamId: string) => {
  const task = await MongoTeamEnterpriseAuthTask.findOne({
    teamId,
    status: { $in: pendingTaskStatuses }
  }).lean();
  return task;
};

const checkStartPreconditions = async ({
  teamId,
  operator,
  normalizedUnifiedCreditCode
}: {
  teamId: string;
  operator: AuthOperator;
  normalizedUnifiedCreditCode: string;
}) => {
  await expireCurrentTaskIfNeeded(teamId);
  const [verifiedAuth, currentTask, teamTask] = await Promise.all([
    MongoTeamEnterpriseAuth.findOne({ teamId }).lean(),
    getCurrentEnterpriseAuthTask(teamId),
    getTeamEnterpriseAuthTask(teamId)
  ]);

  if (verifiedAuth) {
    throw new Error(EnterpriseAuthErrEnum.alreadyVerified);
  }

  const usedTimes = teamTask?.usedTimes ?? 0;
  if (currentTask) {
    assertEnterpriseAuthTaskOperator({ task: currentTask, operator });
    return {
      restore: true as const,
      task: currentTask
    };
  }

  if (isEnterpriseAuthTimesExhausted(usedTimes)) {
    throw new Error(EnterpriseAuthErrEnum.noRemainingTimes);
  }

  if (teamTask?.startedAt && Date.now() - teamTask.startedAt.getTime() < 60 * 1000) {
    throw new Error(EnterpriseAuthErrEnum.tooFrequent);
  }

  const verified = await MongoTeamEnterpriseAuth.exists({
    unifiedCreditCode: normalizedUnifiedCreditCode
  });
  if (verified) {
    throw new Error(EnterpriseAuthErrEnum.enterpriseOccupied);
  }

  return {
    restore: false as const,
    usedTimes
  };
};

const startingTaskCleanupUnset = {
  orderId: 1,
  transferAmountFen: 1,
  transferRespCode: 1,
  transferRespMsg: 1,
  grantExpiredAt: 1,
  lastErrorCode: 1,
  lastErrorMessage: 1,
  expireAt: 1,
  endedAt: 1
};

const buildStartConflictResponse = async ({
  teamId,
  operator,
  normalizedUnifiedCreditCode
}: {
  teamId: string;
  operator: AuthOperator;
  normalizedUnifiedCreditCode: string;
}) => {
  const [verifiedAfterPrecheck, currentTask, teamTask] = await Promise.all([
    MongoTeamEnterpriseAuth.findOne({
      $or: [{ teamId }, { unifiedCreditCode: normalizedUnifiedCreditCode }]
    }).lean(),
    getCurrentEnterpriseAuthTask(teamId),
    getTeamEnterpriseAuthTask(teamId)
  ]);

  if (verifiedAfterPrecheck?.teamId?.toString() === teamId) {
    throw new Error(EnterpriseAuthErrEnum.alreadyVerified);
  }
  if (verifiedAfterPrecheck?.unifiedCreditCode === normalizedUnifiedCreditCode) {
    throw new Error(EnterpriseAuthErrEnum.enterpriseOccupied);
  }
  if (currentTask) {
    assertEnterpriseAuthTaskOperator({ task: currentTask, operator });
    return {
      status: TeamEnterpriseAuthStatusEnum.verifying,
      currentTask: buildLightTask({ currentTask }),
      usedTimes: currentTask.usedTimes,
      message: '已恢复当前认证任务'
    };
  }
  if (isEnterpriseAuthTimesExhausted(teamTask?.usedTimes ?? 0)) {
    throw new Error(EnterpriseAuthErrEnum.noRemainingTimes);
  }
  if (teamTask?.startedAt && Date.now() - teamTask.startedAt.getTime() < 60 * 1000) {
    throw new Error(EnterpriseAuthErrEnum.tooFrequent);
  }

  throw new Error(EnterpriseAuthErrEnum.enterpriseOccupied);
};

const markStartAsFailed = async ({
  teamId,
  taskId,
  status,
  lastErrorCode,
  lastErrorMessage,
  transferRespCode,
  transferRespMsg
}: {
  teamId: string;
  taskId: string;
  status:
    | TeamEnterpriseAuthTaskStatusEnum.service_failed
    | TeamEnterpriseAuthTaskStatusEnum.info_failed;
  lastErrorCode: string;
  lastErrorMessage: string;
  transferRespCode?: string;
  transferRespMsg?: string;
}) => {
  const now = new Date();
  await MongoTeamEnterpriseAuthTask.updateOne(
    {
      teamId,
      taskId,
      status: TeamEnterpriseAuthTaskStatusEnum.starting
    },
    {
      $set: {
        status,
        endedAt: now,
        ...(transferRespCode && { transferRespCode }),
        ...(transferRespMsg && { transferRespMsg }),
        lastErrorCode,
        lastErrorMessage,
        updateTime: now
      }
    }
  );
};

/**
 * 发起企业认证。外部打款调用不放进 Mongo 事务，抢到本地 starting 任务后再调用服务。
 */
export const startEnterpriseAuth = async ({
  operator,
  data
}: {
  operator: AuthOperator;
  data: StartEnterpriseAuthBodyType;
}) => {
  enabledGuard();
  serviceConfigGuard();

  const { teamId } = operator;
  const normalizedUnifiedCreditCode = normalizeUnifiedCreditCode(data.unifiedCreditCode);
  const bankAccount = normalizeBankAccount(data.bankAccount);
  const precheck = await checkStartPreconditions({
    teamId,
    operator,
    normalizedUnifiedCreditCode
  });
  if (precheck.restore) {
    return {
      status: TeamEnterpriseAuthStatusEnum.verifying,
      currentTask: buildLightTask({ currentTask: precheck.task }),
      usedTimes: precheck.task.usedTimes,
      message: '已恢复当前认证任务'
    };
  }
  await expireActiveUnifiedCreditCodeLocksIfNeeded(normalizedUnifiedCreditCode);

  const now = new Date();
  const taskId = createEnterpriseAuthTaskId();
  const startingTask = {
    teamId: toObjectId(teamId),
    userId: toObjectId(operator.userId),
    tmbId: toObjectId(operator.tmbId),
    taskId,
    status: TeamEnterpriseAuthTaskStatusEnum.starting,
    enterpriseName: data.enterpriseName.trim(),
    unifiedCreditCode: normalizedUnifiedCreditCode,
    legalPersonName: data.legalPersonName.trim(),
    bankName: data.bankName.trim(),
    bankAccount,
    contactName: data.contactName.trim(),
    contactTitle: data.contactTitle.trim(),
    contactPhone: data.contactPhone.trim(),
    demand: data.demand.trim(),
    amountErrorTimes: 0,
    usedTimes: precheck.usedTimes,
    startedAt: now,
    createTime: now,
    updateTime: now
  };

  try {
    const [verifiedAfterPrecheck, teamTask] = await Promise.all([
      MongoTeamEnterpriseAuth.findOne({
        $or: [{ teamId }, { unifiedCreditCode: normalizedUnifiedCreditCode }]
      }).lean(),
      getTeamEnterpriseAuthTask(teamId)
    ]);

    if (verifiedAfterPrecheck?.teamId?.toString() === teamId) {
      throw new Error(EnterpriseAuthErrEnum.alreadyVerified);
    }
    if (verifiedAfterPrecheck?.unifiedCreditCode === normalizedUnifiedCreditCode) {
      throw new Error(EnterpriseAuthErrEnum.enterpriseOccupied);
    }
    const currentTask = await getCurrentEnterpriseAuthTask(teamId);
    if (currentTask) {
      assertEnterpriseAuthTaskOperator({ task: currentTask, operator });
      return {
        status: TeamEnterpriseAuthStatusEnum.verifying,
        currentTask: buildLightTask({ currentTask }),
        usedTimes: currentTask.usedTimes,
        message: '已恢复当前认证任务'
      };
    }
    if (isEnterpriseAuthTimesExhausted(teamTask?.usedTimes ?? 0)) {
      throw new Error(EnterpriseAuthErrEnum.noRemainingTimes);
    }
    if (teamTask?.startedAt && Date.now() - teamTask.startedAt.getTime() < 60 * 1000) {
      throw new Error(EnterpriseAuthErrEnum.tooFrequent);
    }

    const claimedTask = await MongoTeamEnterpriseAuthTask.findOneAndUpdate(
      {
        teamId,
        $and: [
          { status: { $nin: pendingTaskStatuses } },
          { usedTimes: { $lt: EnterpriseAuthMaxTimes } }
        ],
        $or: [
          { startedAt: { $exists: false } },
          { startedAt: { $lte: new Date(now.getTime() - 60 * 1000) } }
        ]
      },
      {
        $set: startingTask,
        $unset: startingTaskCleanupUnset
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    ).lean();
    if (!claimedTask || claimedTask.taskId !== taskId) {
      return await buildStartConflictResponse({ teamId, operator, normalizedUnifiedCreditCode });
    }
  } catch (error) {
    if (isMongoDuplicateKeyError(error)) {
      return await buildStartConflictResponse({ teamId, operator, normalizedUnifiedCreditCode });
    }
    throw error;
  }

  const verifiedAfterLock = await MongoTeamEnterpriseAuth.exists({
    unifiedCreditCode: normalizedUnifiedCreditCode
  });
  if (verifiedAfterLock) {
    await markStartAsFailed({
      teamId,
      taskId,
      status: TeamEnterpriseAuthTaskStatusEnum.service_failed,
      lastErrorCode: EnterpriseAuthErrEnum.enterpriseOccupied,
      lastErrorMessage: '该企业正在认证或已被认证'
    });
    throw new Error(EnterpriseAuthErrEnum.enterpriseOccupied);
  }

  const transferResult = await createEnterpriseAuthTransfer({
    enterpriseName: data.enterpriseName.trim(),
    unifiedCreditCode: normalizedUnifiedCreditCode,
    legalPersonName: data.legalPersonName.trim(),
    bankName: data.bankName.trim(),
    bankAccount
  });

  if (transferResult.type === 'timeout' || transferResult.type === 'service_failed') {
    await markStartAsFailed({
      teamId,
      taskId,
      status: TeamEnterpriseAuthTaskStatusEnum.service_failed,
      lastErrorCode:
        transferResult.type === 'timeout'
          ? EnterpriseAuthErrEnum.serviceTimeout
          : EnterpriseAuthErrEnum.serviceError,
      lastErrorMessage:
        transferResult.type === 'timeout' ? '服务网络超时，请稍后重试' : '验证服务错误，请稍后重试'
    });
    throw new Error(
      transferResult.type === 'timeout'
        ? EnterpriseAuthErrEnum.serviceTimeout
        : EnterpriseAuthErrEnum.serviceError
    );
  }

  if (transferResult.type === 'info_failed') {
    await markStartAsFailed({
      teamId,
      taskId,
      status: TeamEnterpriseAuthTaskStatusEnum.info_failed,
      lastErrorCode: EnterpriseAuthErrEnum.infoFailed,
      lastErrorMessage: '认证信息错误，请重新填写',
      transferRespCode: transferResult.transferRespCode,
      transferRespMsg: transferResult.transferRespMsg
    });
    throw new Error(EnterpriseAuthErrEnum.infoFailed);
  }

  if (transferResult.type !== 'success') {
    throw new Error(EnterpriseAuthErrEnum.serviceError);
  }

  const expireAt = addDays(now, EnterpriseAuthTrialDays);
  const authTask = await MongoTeamEnterpriseAuthTask.findOneAndUpdate(
    {
      teamId,
      taskId,
      status: TeamEnterpriseAuthTaskStatusEnum.starting,
      usedTimes: { $lt: EnterpriseAuthMaxTimes }
    },
    {
      $set: {
        status: TeamEnterpriseAuthTaskStatusEnum.pending_amount,
        orderId: transferResult.orderId,
        transferAmountFen: transferResult.transferAmountFen,
        transferRespCode: transferResult.transferRespCode,
        transferRespMsg: transferResult.transferRespMsg,
        expireAt,
        updateTime: new Date()
      },
      // 认证服务已确认企业信息并进入金额验证页，此时消耗一次认证次数；金额验证成功不再重复计数。
      $inc: {
        usedTimes: 1
      }
    },
    {
      new: true
    }
  ).lean();

  if (!authTask) {
    throw new Error(EnterpriseAuthErrEnum.taskNotFound);
  }

  return {
    status: TeamEnterpriseAuthStatusEnum.verifying,
    currentTask: buildLightTask({ currentTask: authTask }),
    usedTimes: authTask.usedTimes,
    message: '已成功打款，请确认打款金额'
  };
};
