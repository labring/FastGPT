import React from 'react';
import { Box, Button, Flex } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import type { GetEnterpriseAuthStatusResponseType } from '@fastgpt/global/openapi/support/user/team/enterpriseAuth/api';
import { EnterpriseAuthAmountMaxErrorTimes } from '@fastgpt/global/support/user/team/enterpriseAuth/constant';
import EnterpriseAuthInfoForm from './InfoForm';
import EnterpriseAuthAmountForm from './AmountForm';
import { useEnterpriseAuthFormFlow } from './useEnterpriseAuthFormFlow';
import { enterpriseAuthFooterButtonStyles } from './shared';

type EnterpriseAuthModalProps = {
  defaultStatus: GetEnterpriseAuthStatusResponseType;
  onClose: () => void;
  onNoRemainingTimes: () => void;
  onSuccess: () => void;
};

const EnterpriseAuthModal = ({
  defaultStatus,
  onClose,
  onNoRemainingTimes,
  onSuccess
}: EnterpriseAuthModalProps) => {
  const flow = useEnterpriseAuthFormFlow({
    defaultStatus,
    onClose,
    onNoRemainingTimes,
    onSuccess
  });

  const remainingAmountVerifyTimes = Math.max(
    EnterpriseAuthAmountMaxErrorTimes -
      (flow.taskDetail?.amountErrorTimes ?? defaultStatus.currentTask?.amountErrorTimes ?? 0),
    0
  );
  const title = flow.t('account_team:enterprise_auth_title');
  const modalTitle = (
    <Flex flexDirection={'column'} gap={'10px'} w={'full'}>
      <Box>{title}</Box>
      <Box
        color={'myGray.500'}
        fontSize={'14px'}
        fontWeight={400}
        lineHeight={'20px'}
        letterSpacing={'0.25px'}
      >
        {flow.t('account_team:enterprise_auth_modal_desc')}
      </Box>
    </Flex>
  );

  return (
    <MyModal
      isOpen
      onClose={onClose}
      isCentered
      size={'lg'}
      title={modalTitle}
      footer={
        flow.step === 'form' ? (
          <>
            <Button
              variant={'whiteBase'}
              w={'64px'}
              onClick={onClose}
              {...enterpriseAuthFooterButtonStyles}
            >
              {flow.t('account_team:enterprise_auth_cancel')}
            </Button>
            <Button
              isLoading={flow.starting}
              onClick={flow.handleStartClick}
              {...enterpriseAuthFooterButtonStyles}
            >
              {flow.t('account_team:enterprise_auth_start')}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant={'whiteBase'}
              mr={'auto'}
              isLoading={flow.resetting}
              onClick={flow.handleReset}
              {...enterpriseAuthFooterButtonStyles}
            >
              {flow.t('account_team:enterprise_auth_reset_info')}
            </Button>
            <Button
              isDisabled={
                !flow.canSubmitAmount ||
                !flow.hasLoadedTaskDetail ||
                (flow.taskDetail?.amountErrorTimes ?? 0) >= EnterpriseAuthAmountMaxErrorTimes
              }
              isLoading={flow.verifying || flow.loadingTaskDetail}
              onClick={flow.amountForm.handleSubmit(flow.handleVerify)}
              {...enterpriseAuthFooterButtonStyles}
            >
              {flow.t('account_team:enterprise_auth_verify_with_remaining', {
                count: remainingAmountVerifyTimes
              })}
            </Button>
          </>
        )
      }
    >
      {flow.step === 'form' ? (
        <EnterpriseAuthInfoForm
          t={flow.t}
          startForm={flow.startForm}
          bankOptions={flow.bankOptions}
          hasSubmittedStartForm={flow.hasSubmittedStartForm}
          hasBankLoadError={flow.hasBankLoadError}
          isBankLoading={flow.isBankLoading}
          reloadBanks={flow.reloadBanks}
        />
      ) : (
        <EnterpriseAuthAmountForm
          t={flow.t}
          amountForm={flow.amountForm}
          taskDetail={flow.taskDetail}
          shouldShowAmountError={flow.shouldShowAmountError}
          setShowAmountError={flow.setShowAmountError}
        />
      )}
    </MyModal>
  );
};

export default React.memo(EnterpriseAuthModal);
