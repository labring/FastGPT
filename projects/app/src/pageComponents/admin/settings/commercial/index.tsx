import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Input, Textarea, SimpleGrid, Text } from '@chakra-ui/react';
import { useForm, Controller } from 'react-hook-form';
import { useDomainConfig } from '@/web/common/system/useDomainConfig';
import AdminSettingPage from '@/pageComponents/admin/settings/AdminSettingPage';
import AdminSettingSection from '@/pageComponents/admin/settings/AdminSettingSection';
import AdminFormItem from '@/pageComponents/admin/settings/AdminFormItem';
import AdminSwitchRow from '@/pageComponents/admin/settings/AdminSwitchRow';
import type { SettingTOCItem } from '@/pageComponents/admin/settings/AdminSettingTOC';
import type { SystemInstanceConfigDomainMap } from '@fastgpt/global/common/system/config/type';
import PlansSettingSection, { type PlansSettingSectionHandle } from './PlansSettingSection';

type CommercialConfigForm = SystemInstanceConfigDomainMap['commercial'];

const CommercialSettingComponent = () => {
  const { t } = useSafeTranslation();
  const tocItems: SettingTOCItem[] = useMemo(
    () => [
      { id: 'plans', label: t('admin:pay_section_plans') },
      { id: 'features', label: t('admin:pay_section_features') },
      { id: 'paymentForm', label: t('admin:pay_section_corporate') },
      { id: 'wxPay', label: t('admin:pay_section_wx') },
      { id: 'alipay', label: t('admin:pay_section_alipay') },
      { id: 'bankPay', label: t('admin:pay_section_bank_desc') },
      { id: 'billingNotify', label: t('admin:pay_section_notify_sms') }
    ],
    [t]
  );

  const { effectiveConfig, isLoading, isUpdating, updateConfig } = useDomainConfig('commercial');
  const plansRef = useRef<PlansSettingSectionHandle>(null);
  const [plansSaving, setPlansSaving] = useState(false);

  const { control, handleSubmit, reset, register } = useForm<CommercialConfigForm>({
    defaultValues: effectiveConfig
  });

  useEffect(() => {
    if (effectiveConfig && Object.keys(effectiveConfig).length > 0) {
      reset(effectiveConfig);
    }
  }, [effectiveConfig, reset]);

  const savePlans = useCallback(async () => {
    // 套餐保存失败必须向外冒泡中断整个保存流程，不能静默吞掉异常导致半成功状态
    await plansRef.current?.save();
  }, []);

  const saveAll = useCallback(
    async (formData: CommercialConfigForm) => {
      // 先保存套餐：若套餐校验或保存失败直接中断，不触发生效商业配置保存
      await savePlans();

      await updateConfig({
        showCoupon: Boolean(formData.showCoupon),
        showDiscountCoupon: Boolean(formData.showDiscountCoupon),
        payFormUrl: formData.payFormUrl || '',
        agentSandboxFreeTip: Boolean(formData.agentSandboxFreeTip),
        payment: formData.payment,
        billingNotify: formData.billingNotify
      });
    },
    [savePlans, updateConfig]
  );

  // 在点击时再包装，避免 render 期创建会读取 ref 的提交闭包
  const onSave = useCallback(() => {
    void handleSubmit(saveAll)();
  }, [handleSubmit, saveAll]);

  return (
    <AdminSettingPage
      headerTitle={t('admin:page_title_pay')}
      tocItems={tocItems}
      isLoading={isLoading}
      isSaving={isUpdating || plansSaving}
      onSave={onSave}
    >
      {/* 1. 订阅套餐：套餐等级、积分包与活动配置 */}
      <AdminSettingSection id="plans" title={t('admin:pay_section_plans')}>
        <PlansSettingSection ref={plansRef} onSavingChange={setPlansSaving} />
      </AdminSettingSection>

      {/* 2. 功能展示：优惠券策略与提示展示策略合并 */}
      <AdminSettingSection id="features" title={t('admin:pay_section_features')} showDivider>
        <SimpleGrid columns={[1, 2]} spacingX={16} spacingY={4}>
          <Controller
            name="showCoupon"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label={t('admin:show_recharge_coupons')}
                tooltip={t('admin:show_coupon_redemption_and_available_coupon_entries_on_the_r')}
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
                label={t('admin:show_discount_coupons')}
                tooltip={t('admin:show_instant_discounts_and_coupon_options_during_user_checko')}
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />

          <Controller
            name="agentSandboxFreeTip"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label={t('admin:agent_sandbox_free_trial_banner')}
                tooltip={t('admin:show_a_limited_time_free_trial_banner_at_the_top_of_the_agen')}
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </SimpleGrid>
      </AdminSettingSection>

      {/* 3. 对公收款配置 */}
      <AdminSettingSection id="paymentForm" title={t('admin:pay_section_corporate')} showDivider>
        <AdminFormItem
          label={t('admin:bank_transfer_corporate_form_url')}
          tooltip={t('admin:full_url_of_the_corporate_form_a_user_fills_in_for_large_ban')}
        >
          <Input {...register('payFormUrl')} placeholder="https://form.example.com/pay" />
        </AdminFormItem>
      </AdminSettingSection>

      {/* 4. 微信支付凭据 */}
      <AdminSettingSection id="wxPay" title={t('admin:pay_section_wx')} showDivider>
        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem label="AppId" tooltip={t('admin:appid_bound_to_wechat_pay')}>
            <Input {...register('payment.wx.appId')} placeholder="wx******" />
          </AdminFormItem>
          <AdminFormItem
            label={t('admin:merchant_id_mchid')}
            tooltip={t('admin:wechat_pay_merchant_id')}
          >
            <Input {...register('payment.wx.mchId')} placeholder="1*********" />
          </AdminFormItem>
          <AdminFormItem
            label={t('admin:certificate_serial_number_serialno')}
            tooltip={t('admin:api_certificate_serial_no')}
          >
            <Input {...register('payment.wx.serialNo')} placeholder="******" />
          </AdminFormItem>
          <AdminFormItem label={t('admin:apiv3_key')} tooltip={t('admin:wechat_pay_apiv3_key')}>
            <Input type="password" {...register('payment.wx.apiV3Key')} placeholder="******" />
          </AdminFormItem>
          <AdminFormItem
            label={t('admin:payment_callback_url')}
            tooltip={t('admin:wechat_pay_async_notification_url')}
          >
            <Input
              {...register('payment.wx.notifyUrl')}
              placeholder="https://example.com/api/pay/wx"
            />
          </AdminFormItem>
        </SimpleGrid>

        <AdminFormItem
          label={t('admin:merchant_private_key_pem')}
          tooltip={t('admin:wechat_pay_api_certificate_private_key_paste_the_full_conten')}
        >
          <Textarea
            {...register('payment.wx.privateKey')}
            rows={6}
            placeholder="-----BEGIN PRIVATE KEY-----"
          />
        </AdminFormItem>
      </AdminSettingSection>

      {/* 5. 支付宝凭据 */}
      <AdminSettingSection id="alipay" title={t('admin:pay_section_alipay')} showDivider>
        {' '}
        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem label="AppId" tooltip={t('admin:alipay_open_platform_appid')}>
            <Input {...register('payment.alipay.appId')} placeholder="2021********" />
          </AdminFormItem>
          <AdminFormItem
            label={t('admin:gateway_url')}
            tooltip={t('admin:alipay_gateway_url_defaults_to_the_official_gateway')}
          >
            <Input
              {...register('payment.alipay.gateway')}
              placeholder="https://openapi.alipay.com/gateway.do"
            />
          </AdminFormItem>
          <AdminFormItem
            label={t('admin:payment_callback_url')}
            tooltip={t('admin:alipay_async_notification_url')}
          >
            <Input
              {...register('payment.alipay.notifyUrl')}
              placeholder="https://example.com/api/pay/alipay"
            />
          </AdminFormItem>
          <AdminFormItem
            label={t('admin:fallback_endpoint')}
            tooltip={t('admin:custom_endpoint_for_private_or_special_scenarios')}
          >
            <Input {...register('payment.alipay.endpoint')} placeholder="https://..." />
          </AdminFormItem>
        </SimpleGrid>
        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem
            label={t('admin:application_private_key')}
            tooltip={t('admin:application_private_key_content_paste_the_full_pem_text')}
          >
            <Textarea
              {...register('payment.alipay.appPrivateKey')}
              rows={5}
              placeholder="-----BEGIN RSA PRIVATE KEY-----"
            />
          </AdminFormItem>
          <AdminFormItem
            label={t('admin:application_public_certificate')}
            tooltip={t('admin:application_public_certificate_content')}
          >
            <Textarea
              {...register('payment.alipay.appCertContent')}
              rows={5}
              placeholder="-----BEGIN CERTIFICATE-----"
            />
          </AdminFormItem>
          <AdminFormItem
            label={t('admin:alipay_root_certificate')}
            tooltip={t('admin:alipay_root_certificate_content')}
          >
            <Textarea
              {...register('payment.alipay.rootCertContent')}
              rows={5}
              placeholder="-----BEGIN CERTIFICATE-----"
            />
          </AdminFormItem>
          <AdminFormItem
            label={t('admin:alipay_public_certificate')}
            tooltip={t('admin:alipay_public_certificate_content')}
          >
            <Textarea
              {...register('payment.alipay.publicCertContent')}
              rows={5}
              placeholder="-----BEGIN CERTIFICATE-----"
            />
          </AdminFormItem>
        </SimpleGrid>
      </AdminSettingSection>

      {/* 对公转账说明 */}
      {/* 6. 对公转账说明 */}
      <AdminSettingSection id="bankPay" title={t('admin:pay_section_bank_desc')} showDivider>
        <AdminFormItem
          label={t('admin:bank_transfer_instructions_copy')}
          tooltip={t('admin:payee_account_info_and_transfer_instructions_shown_when_the')}
        >
          <Textarea
            {...register('payment.bank.description')}
            rows={4}
            placeholder={t('admin:bank_xxx_10_account_name_xxx_10_account_no_xxx')}
          />
        </AdminFormItem>
      </AdminSettingSection>

      {/* 7. 账单通知短信 */}
      <AdminSettingSection id="billingNotify" title={t('admin:pay_section_notify_sms')} showDivider>
        <Text fontSize={'xs'} color={'myGray.500'} mb={3}>
          {t('admin:billing_notification_sms_templates_apply_for_template_ids_in')}
        </Text>

        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem
            label={t('admin:top_up_received_chinese_template')}
            tooltip={t('admin:sms_template_id_for_successful_top_up_notification_chinese')}
          >
            <Input {...register('billingNotify.paymentReceived.zh')} placeholder="SMS_xxx" />
          </AdminFormItem>
          <AdminFormItem
            label={t('admin:low_balance_alert_chinese_template')}
            tooltip={t('admin:sms_template_id_for_low_points_balance_alert_chinese')}
          >
            <Input {...register('billingNotify.lackOfPoints.zh')} placeholder="SMS_xxx" />
          </AdminFormItem>
          <AdminFormItem
            label={t('admin:points_running_out_chinese_template')}
            tooltip={t('admin:sms_template_id_for_10_points_remaining_reminder_chinese')}
          >
            <Input {...register('billingNotify.pointsTenPercentRemain.zh')} placeholder="SMS_xxx" />
          </AdminFormItem>
          <AdminFormItem
            label={t('admin:plan_expiring_soon_chinese_template')}
            tooltip={t('admin:sms_template_id_for_plan_expiry_reminder_chinese')}
          >
            <Input {...register('billingNotify.expireSoon.zh')} placeholder="SMS_xxx" />
          </AdminFormItem>
          <AdminFormItem
            label={t('admin:plan_expired_chinese_template')}
            tooltip={t('admin:sms_template_id_for_plan_expired_notification_chinese')}
          >
            <Input {...register('billingNotify.expired.zh')} placeholder="SMS_xxx" />
          </AdminFormItem>
        </SimpleGrid>
      </AdminSettingSection>
    </AdminSettingPage>
  );
};

export default React.memo(CommercialSettingComponent);
