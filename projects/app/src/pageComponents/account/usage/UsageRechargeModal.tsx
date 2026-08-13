import dynamic from 'next/dynamic';

const RechargeModal = dynamic(() =>
  import('@/components/support/wallet/NotSufficientModal/index').then((mod) => mod.RechargeModal)
);

type UsageRechargeModalProps = {
  onClose: () => void;
  onPaySuccess: () => void;
};

/** 在使用记录页打开充值弹窗时再加载弹窗代码。 */
const UsageRechargeModal = (props: UsageRechargeModalProps) => <RechargeModal {...props} />;

export default UsageRechargeModal;
