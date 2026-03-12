import React from 'react';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { useTranslation } from 'next-i18next';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useDisclosure } from '@chakra-ui/react';
import { RechargeModal } from '@/components/support/wallet/NotSufficientModal';

const SandboxNotSupportTip = ({ type }: { type: 'systemDisable' | 'freeDisable' }) => {
  const { t } = useTranslation();
  const {
    isOpen: isRechargeModalOpen,
    onOpen: onRechargeModalOpen,
    onClose: onRechargeModalClose
  } = useDisclosure();

  const map = useMemoEnhance(() => {
    if (type === 'systemDisable') {
      return {
        title: t('app:sandbox_not_support_tip'),
        tip: ''
      };
    }
    return {
      title: t('app:sandbox_free_not_support'),
      tip: t('app:sandbox_free_not_support_tip')
    };
  }, [type, t]);

  return (
    <>
      <MyTooltip label={map.tip}>
        <MyTag
          cursor={map.tip ? 'pointer' : 'default'}
          onClick={() => {
            if (map.tip) {
              onRechargeModalOpen();
            }
          }}
        >
          {map.title}
        </MyTag>
      </MyTooltip>

      {isRechargeModalOpen && (
        <RechargeModal onClose={onRechargeModalClose} onPaySuccess={onRechargeModalClose} />
      )}
    </>
  );
};

export default SandboxNotSupportTip;
