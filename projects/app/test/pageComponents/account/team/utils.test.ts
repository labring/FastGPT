import { describe, expect, it } from 'vitest';
import {
  shouldShowEnterpriseAuthAmountError,
  shouldShowEnterpriseAuthContactBusinessModal
} from '../../../../src/pageComponents/account/team/utils';
import {
  EnterpriseAuthMaxTimes,
  TeamEnterpriseAuthTaskStatusEnum
} from '@fastgpt/global/support/user/team/enterpriseAuth/constant';

describe('shouldShowEnterpriseAuthAmountError', () => {
  it('历史 amount_failed 任务重新进入时不展示金额错误', () => {
    expect(
      shouldShowEnterpriseAuthAmountError({
        taskStatus: TeamEnterpriseAuthTaskStatusEnum.amount_failed,
        showCurrentSubmitError: false
      })
    ).toBe(false);
  });

  it('本次提交失败后才展示金额错误', () => {
    expect(
      shouldShowEnterpriseAuthAmountError({
        taskStatus: TeamEnterpriseAuthTaskStatusEnum.amount_failed,
        showCurrentSubmitError: true
      })
    ).toBe(true);
  });

  it('非金额错误状态即使存在本次失败标记也不展示金额错误', () => {
    expect(
      shouldShowEnterpriseAuthAmountError({
        taskStatus: TeamEnterpriseAuthTaskStatusEnum.pending_amount,
        showCurrentSubmitError: true
      })
    ).toBe(false);
  });
});

describe('shouldShowEnterpriseAuthContactBusinessModal', () => {
  it('认证次数耗尽且没有当前任务时展示商务咨询弹窗', () => {
    expect(
      shouldShowEnterpriseAuthContactBusinessModal({
        usedTimes: EnterpriseAuthMaxTimes,
        hasCurrentTask: false
      })
    ).toBe(true);
  });

  it('认证次数耗尽但存在待确认打款任务时继续允许恢复认证', () => {
    expect(
      shouldShowEnterpriseAuthContactBusinessModal({
        usedTimes: EnterpriseAuthMaxTimes,
        hasCurrentTask: true
      })
    ).toBe(false);
  });

  it('认证状态未加载完成时不提前展示商务咨询弹窗', () => {
    expect(
      shouldShowEnterpriseAuthContactBusinessModal({
        usedTimes: undefined,
        hasCurrentTask: false
      })
    ).toBe(false);
  });
});
