import React from 'react';
import { Button, ModalBody, ModalCloseButton, ModalFooter } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import type { GetEnterpriseAuthStatusResponseType } from '@fastgpt/global/openapi/support/user/team/enterpriseAuth/api';
import { EnterpriseAuthAmountMaxErrorTimes } from '@fastgpt/global/support/user/team/enterpriseAuth/constant';
import EnterpriseAuthInfoForm from './EnterpriseAuthModal/EnterpriseAuthInfoForm';
import EnterpriseAuthAmountForm from './EnterpriseAuthModal/EnterpriseAuthAmountForm';
import { useEnterpriseAuthFormFlow } from './EnterpriseAuthModal/useEnterpriseAuthFormFlow';

type EnterpriseAuthModalProps = {
  defaultStatus: GetEnterpriseAuthStatusResponseType;
  onClose: () => void;
  onSuccess: () => void;
};

const EnterpriseAuthModal = ({ defaultStatus, onClose, onSuccess }: EnterpriseAuthModalProps) => {
  const flow = useEnterpriseAuthFormFlow({
    defaultStatus,
    onClose,
    onSuccess
  });

  if (flow.shouldBlockEnterpriseAuthForm) return null;

  return (
    <MyModal
      isOpen
      onClose={onClose}
      isCentered
      w={['90vw', '800px']}
      maxW={'90vw'}
      borderRadius={'10px'}
      maxH={'80vh'}
      overflow={'hidden'}
      boxShadow={'0px 0px 1px rgba(19, 51, 107, 0.1), 0px 4px 10px rgba(19, 51, 107, 0.1)'}
      showCloseButton={false}
    >
      <ModalCloseButton top={'8px'} right={'8px'} w={'36px'} h={'36px'} />
      <ModalBody
        px={['20px', '32px']}
        pt={['24px', '32px']}
        pb={0}
        flex={'1 1 auto'}
        minH={0}
        overflowY={'auto'}
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
      </ModalBody>
      <ModalFooter
        px={['20px', '32px']}
        pt={'24px'}
        pb={['24px', '32px']}
        justifyContent={flow.step === 'amount' ? 'space-between' : 'flex-end'}
        gap={'12px'}
      >
        {flow.step === 'form' ? (
          <>
            <Button
              h={'32px'}
              px={'14px'}
              fontSize={'12px'}
              variant={'whiteBase'}
              onClick={onClose}
            >
              {flow.t('account_team:enterprise_auth_cancel')}
            </Button>
            <Button
              h={'32px'}
              px={'14px'}
              fontSize={'12px'}
              bg={'#3370FF'}
              color={'white'}
              isLoading={flow.starting}
              onClick={flow.handleStartClick}
              _hover={{ bg: '#2152D9' }}
            >
              {flow.t('account_team:enterprise_auth_start')}
            </Button>
          </>
        ) : (
          <>
            <Button
              h={'32px'}
              px={'14px'}
              fontSize={'12px'}
              variant={'whiteBase'}
              isLoading={flow.resetting}
              onClick={flow.handleReset}
            >
              {flow.t('account_team:enterprise_auth_reset_info')}
            </Button>
            <Button
              h={'32px'}
              px={'14px'}
              fontSize={'12px'}
              bg={'#3370FF'}
              color={'white'}
              isDisabled={
                !flow.canSubmitAmount ||
                !flow.hasLoadedTaskDetail ||
                (flow.taskDetail?.amountErrorTimes ?? 0) >= EnterpriseAuthAmountMaxErrorTimes
              }
              isLoading={flow.verifying || flow.loadingTaskDetail}
              onClick={flow.amountForm.handleSubmit(flow.handleVerify)}
              _hover={{ bg: '#2152D9' }}
              _disabled={{
                bg: 'rgba(51, 112, 255, 0.3)',
                color: 'white',
                opacity: 1,
                cursor: 'not-allowed'
              }}
            >
              {flow.t('account_team:enterprise_auth_submit')}
            </Button>
          </>
        )}
      </ModalFooter>
    </MyModal>
  );
};

export default React.memo(EnterpriseAuthModal);
