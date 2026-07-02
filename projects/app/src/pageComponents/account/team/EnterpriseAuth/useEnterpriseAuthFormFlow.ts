import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import type {
  GetEnterpriseAuthStatusResponseType,
  StartEnterpriseAuthBodyType
} from '@fastgpt/global/openapi/support/user/team/enterpriseAuth/api';
import { EnterpriseAuthErrEnum } from '@fastgpt/global/support/user/team/enterpriseAuth/constant';
import {
  getEnterpriseAuthBanks,
  getEnterpriseAuthCurrentTaskDetail,
  resetEnterpriseAuthTask,
  startEnterpriseAuth,
  verifyEnterpriseAuthAmount
} from '@/web/support/user/team/enterpriseAuth/api';
import {
  canOpenEnterpriseAuthAmountStep,
  shouldShowEnterpriseAuthAmountError,
  shouldShowEnterpriseAuthContactBusinessModal
} from './utils';
import {
  formatEnterpriseAuthBankOptions,
  getErrorCode,
  PositiveIntegerPattern,
  type AmountFormType
} from './shared';

type UseEnterpriseAuthFormFlowProps = {
  defaultStatus: GetEnterpriseAuthStatusResponseType;
  onClose: () => void;
  onSuccess: () => void;
};

export const useEnterpriseAuthFormFlow = ({
  defaultStatus,
  onClose,
  onSuccess
}: UseEnterpriseAuthFormFlowProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const shouldBlockEnterpriseAuthForm = shouldShowEnterpriseAuthContactBusinessModal({
    usedTimes: defaultStatus.usedTimes,
    hasCurrentTask: !!defaultStatus.currentTask
  });
  const canOpenInitialAmountStep = canOpenEnterpriseAuthAmountStep(
    defaultStatus.currentTask?.status
  );
  const [step, setStep] = useState<'form' | 'amount'>(
    defaultStatus.currentTask && canOpenInitialAmountStep ? 'amount' : 'form'
  );
  // 历史 amount_failed 只表示本任务曾填错金额；重新打开弹窗时不应继续展示上次的输入错误。
  const [showAmountError, setShowAmountError] = useState(false);
  const [hasSubmittedStartForm, setHasSubmittedStartForm] = useState(false);
  const startForm = useForm<StartEnterpriseAuthBodyType>({
    mode: 'onChange',
    defaultValues: {
      enterpriseName: '',
      unifiedCreditCode: '',
      legalPersonName: '',
      bankAccount: '',
      bankName: '',
      contactName: '',
      contactTitle: '',
      contactPhone: '',
      demand: ''
    }
  });
  const amountForm = useForm<AmountFormType>({
    mode: 'onChange',
    defaultValues: {
      amountCent: ''
    }
  });

  const {
    data: banks = {},
    loading: loadingBanks,
    error: bankLoadError,
    run: reloadBanks
  } = useRequest(getEnterpriseAuthBanks, {
    manual: false,
    ready: step === 'form' && !shouldBlockEnterpriseAuthForm,
    errorToast: t('account_team:enterprise_auth_bank_load_failed')
  });

  const {
    data: taskDetail,
    runAsync: loadTaskDetail,
    loading: loadingTaskDetail
  } = useRequest(getEnterpriseAuthCurrentTaskDetail, {
    manual: !defaultStatus.currentTask,
    // 首次提交成功后也需要手动拉取任务详情，不能被初始 currentTask 为空的 ready 状态拦截。
    ready: true,
    errorToast: t('account_team:enterprise_auth_task_load_failed')
  });

  const { runAsync: onStart, loading: starting } = useRequest(startEnterpriseAuth, {
    errorToast: t('account_team:enterprise_auth_submit_failed')
  });
  const { runAsync: onVerify, loading: verifying } = useRequest(verifyEnterpriseAuthAmount, {
    errorToast: ''
  });
  const { runAsync: onReset, loading: resetting } = useRequest(resetEnterpriseAuthTask, {
    errorToast: t('account_team:enterprise_auth_operation_failed')
  });

  const bankOptions = useMemo(() => formatEnterpriseAuthBankOptions(banks), [banks]);
  const hasBankLoadError = !!bankLoadError && !bankOptions.length;
  const isBankLoading = loadingBanks;
  const amountCentValue = useWatch({ control: amountForm.control, name: 'amountCent' });
  const hasLoadedTaskDetail = !!taskDetail?.taskId;
  const canSubmitAmount =
    hasLoadedTaskDetail && PositiveIntegerPattern.test(String(amountCentValue).trim());
  const shouldShowAmountError = shouldShowEnterpriseAuthAmountError({
    taskStatus: taskDetail?.status,
    showCurrentSubmitError: showAmountError
  });

  /**
   * 认证次数耗尽且没有待验证任务时，认证表单本身也不应展示。
   * 外层入口已做拦截，这里作为弹窗边界的兜底保护，避免旧状态或自动打开误触发。
   */
  useEffect(() => {
    if (!shouldBlockEnterpriseAuthForm) return;
    onClose();
  }, [onClose, shouldBlockEnterpriseAuthForm]);

  useEffect(() => {
    if (!defaultStatus.currentTask || canOpenInitialAmountStep) return;
    onClose();
  }, [canOpenInitialAmountStep, defaultStatus.currentTask, onClose]);

  const handleStart = useCallback(
    async (data: StartEnterpriseAuthBodyType) => {
      const result = await onStart(data);
      onSuccess();
      if (canOpenEnterpriseAuthAmountStep(result.currentTask?.status)) {
        await loadTaskDetail();
        setStep('amount');
        setShowAmountError(false);
        toast({
          title: t('account_team:enterprise_auth_transfer_sent_tip'),
          status: 'success'
        });
        return;
      }

      toast({
        title: result.message || t('account_team:enterprise_auth_processing_label'),
        status: 'info'
      });
      onClose();
    },
    [loadTaskDetail, onClose, onStart, onSuccess, t, toast]
  );

  /**
   * 点击开始认证时一次性校验全部字段，并禁止 react-hook-form 自动聚焦首个错误项。
   * 这样空值红框不会被“先聚焦企业信用代码/银行卡号”的流程卡住。
   */
  const handleStartClick = useCallback(async () => {
    setHasSubmittedStartForm(true);

    const isValid = await startForm.trigger(undefined, { shouldFocus: false });
    if (!isValid) return;

    await handleStart(startForm.getValues());
  }, [handleStart, startForm]);

  const handleVerify = useCallback(
    async ({ amountCent }: AmountFormType) => {
      if (!taskDetail?.taskId) {
        toast({
          title: t('account_team:enterprise_auth_task_load_failed'),
          status: 'warning'
        });
        return;
      }

      const normalizedAmountCent = amountCent.trim();
      if (!PositiveIntegerPattern.test(normalizedAmountCent)) {
        toast({
          title: t('account_team:enterprise_auth_invalid_amount_tip'),
          status: 'warning'
        });
        return;
      }

      try {
        await onVerify({
          taskId: taskDetail.taskId,
          amountCent: Number(normalizedAmountCent)
        });
        toast({
          title: t('account_team:enterprise_auth_success_grant_tip'),
          status: 'success'
        });
        onSuccess();
        onClose();
      } catch (error) {
        const errorCode = getErrorCode(error);

        if (errorCode === EnterpriseAuthErrEnum.amountError) {
          amountForm.reset({ amountCent: '' });
          setShowAmountError(true);
          try {
            await loadTaskDetail();
          } catch {
            onSuccess();
            onClose();
          }
          return;
        }

        toast({
          title: t(getErrText(error, t('account_team:enterprise_auth_verify_failed')) as any),
          status: 'error'
        });
        onSuccess();
        onClose();
      }
    },
    [amountForm, loadTaskDetail, onClose, onSuccess, onVerify, t, taskDetail, toast]
  );

  const handleReset = useCallback(async () => {
    await onReset();
    if (taskDetail) {
      startForm.reset({
        enterpriseName: taskDetail.enterpriseName,
        unifiedCreditCode: taskDetail.unifiedCreditCode,
        legalPersonName: taskDetail.legalPersonName,
        bankAccount: taskDetail.bankAccount,
        bankName: taskDetail.bankName,
        contactName: taskDetail.contactName,
        contactTitle: taskDetail.contactTitle,
        contactPhone: taskDetail.contactPhone,
        demand: taskDetail.demand
      });
    }
    amountForm.reset({ amountCent: '' });
    setShowAmountError(false);
    setHasSubmittedStartForm(false);
    onSuccess();
    setStep('form');
  }, [amountForm, onReset, onSuccess, startForm, taskDetail]);

  return {
    t,
    step,
    startForm,
    amountForm,
    bankOptions,
    hasBankLoadError,
    isBankLoading,
    reloadBanks,
    hasSubmittedStartForm,
    taskDetail,
    loadingTaskDetail,
    starting,
    verifying,
    resetting,
    hasLoadedTaskDetail,
    canSubmitAmount,
    shouldShowAmountError,
    shouldBlockEnterpriseAuthForm,
    setShowAmountError,
    handleStart,
    handleStartClick,
    handleVerify,
    handleReset
  };
};
