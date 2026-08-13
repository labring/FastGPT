import MyLoading from '@fastgpt/web/components/common/MyLoading';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const RechargeModal = dynamic(() =>
  import('@/components/support/wallet/NotSufficientModal/index').then((mod) => mod.RechargeModal)
);

type UsageRechargeModalProps = {
  onClose: () => void;
  onPaySuccess: () => void;
};

/**
 * 在使用记录页打开充值弹窗时才加载套餐文案，避免首屏提前请求 user namespace。
 */
const UsageRechargeModalContent = (props: UsageRechargeModalProps) => {
  useClientTranslation();

  return <RechargeModal {...props} />;
};

const UsageRechargeModal = (props: UsageRechargeModalProps) => (
  <Suspense fallback={<MyLoading />}>
    <UsageRechargeModalContent {...props} />
  </Suspense>
);

export default UsageRechargeModal;
