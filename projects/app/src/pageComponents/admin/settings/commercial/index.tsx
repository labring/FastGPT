import React, { useEffect } from 'react';
import { Input, SimpleGrid } from '@chakra-ui/react';
import { useForm, Controller } from 'react-hook-form';
import { useDomainConfig } from '@/web/common/system/useDomainConfig';
import {
  AdminSettingPage,
  AdminSettingSection,
  AdminFormItem,
  AdminSwitchRow,
  type SettingTOCItem
} from '@/pageComponents/admin/settings';
import type { SystemInstanceConfigDomainMap } from '@fastgpt/global/common/system/config';

type CommercialConfigForm = SystemInstanceConfigDomainMap['commercial'];

const tocItems: SettingTOCItem[] = [
  { id: 'coupons', label: '优惠券策略' },
  { id: 'paymentForm', label: '对公收款配置' },
  { id: 'tips', label: '提示与展示策略' }
];

const CommercialSettingComponent = () => {
  const { effectiveConfig, isLoading, isUpdating, updateConfig } = useDomainConfig('commercial');

  const { control, handleSubmit, reset, register } = useForm<CommercialConfigForm>({
    defaultValues: effectiveConfig
  });

  useEffect(() => {
    if (effectiveConfig && Object.keys(effectiveConfig).length > 0) {
      reset(effectiveConfig);
    }
  }, [effectiveConfig, reset]);

  const onSave = handleSubmit(async (formData) => {
    await updateConfig({
      showCoupon: Boolean(formData.showCoupon),
      showDiscountCoupon: Boolean(formData.showDiscountCoupon),
      payFormUrl: formData.payFormUrl || '',
      agentSandboxFreeTip: Boolean(formData.agentSandboxFreeTip)
    });
  });

  return (
    <AdminSettingPage
      headerTitle={'支付配置'}
      tocItems={tocItems}
      isLoading={isLoading}
      isSaving={isUpdating}
      onSave={onSave}
    >
      {/* 1. 优惠券策略 */}
      <AdminSettingSection id="coupons" title="优惠券策略">
        <SimpleGrid columns={[1, 2]} spacingX={16} spacingY={4}>
          <Controller
            name="showCoupon"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label="展示充值优惠券"
                tooltip="在用户充值页面与侧边栏展示优惠券兑换及可用优惠券入口"
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />

          <Controller
            name="showDiscountCoupon"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label="展示满减折扣券"
                tooltip="在用户结账付费流程中展示立减与折扣优惠选项"
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </SimpleGrid>
      </AdminSettingSection>

      {/* 2. 对公收款配置 */}
      <AdminSettingSection id="paymentForm" title="对公收款配置" showDivider>
        <AdminFormItem
          label="对公转账/企业汇款表单地址"
          tooltip="用户选择大额对公支付时跳转填报付款回单的企业表单完整 URL"
        >
          <Input {...register('payFormUrl')} placeholder="https://form.example.com/pay" />
        </AdminFormItem>
      </AdminSettingSection>

      {/* 3. 提示与展示策略 */}
      <AdminSettingSection id="tips" title="提示与展示策略" showDivider>
        <SimpleGrid columns={[1, 2]} spacingX={16} spacingY={4}>
          <Controller
            name="agentSandboxFreeTip"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label="Agent 沙箱限时免费提示"
                tooltip="在 Agent 执行界面与沙箱环境入口顶部展示限时免费体验提示横幅"
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </SimpleGrid>
      </AdminSettingSection>
    </AdminSettingPage>
  );
};

export default React.memo(CommercialSettingComponent);
