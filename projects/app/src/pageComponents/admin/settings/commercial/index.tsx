import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { useToast } from '@fastgpt/web/hooks/useToast';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Input, Textarea, SimpleGrid, Text } from '@chakra-ui/react';
import { useForm, Controller } from 'react-hook-form';
import { useAdminConfigSaveRequest } from '@/web/common/system/useAdminConfigSaveRequest';
import { ToastHandledError } from '@fastgpt/global/common/error/utils';
import { useDomainConfig, updateDomainConfigApi } from '@/web/common/system/useDomainConfig';
import AdminSettingPage from '@/pageComponents/admin/settings/AdminSettingPage';
import AdminSettingSection from '@/pageComponents/admin/settings/AdminSettingSection';
import AdminFormItem from '@/pageComponents/admin/settings/AdminFormItem';
import AdminSwitchRow from '@/pageComponents/admin/settings/AdminSwitchRow';
import type { SettingTOCItem } from '@/pageComponents/admin/settings/AdminSettingTOC';
import type {
  DeepPartial,
  SystemInstanceConfigDomainMap
} from '@fastgpt/global/common/system/config/type';
import { useAdminPermission } from '@/pageComponents/admin/useAdminPermission';
import { deepMergeConfig } from '@fastgpt/global/common/system/config/merge';
import PlansSettingSection, { type PlansSettingSectionHandle } from './PlansSettingSection';

type CommercialConfigForm = SystemInstanceConfigDomainMap['commercial'];

const CommercialSettingComponent = () => {
  const { t } = useSafeTranslation();
  const { toast } = useToast();
  const { isFieldVisible, filterConfigDataByEdition } = useAdminPermission();

  // SaaS 运营字段是否展示由 ENABLE_SAAS_ADMIN_CONFIG 控制；支付、套餐、积分包始终保留。
  const showCoupon = isFieldVisible('commercial.showCoupon');
  const showDiscountCoupon = isFieldVisible('commercial.showDiscountCoupon');
  const showPayForm = isFieldVisible('commercial.payFormUrl');
  const showFreeClean = isFieldVisible('commercial.billingNotify.freeClean.zh');
  const showFeatureSection = showCoupon || showDiscountCoupon;

  const tocItems: SettingTOCItem[] = useMemo(
    () => [
      { id: 'plans', label: t('admin:pay_section_plans') },
      ...(showFeatureSection ? [{ id: 'features', label: t('admin:pay_section_features') }] : []),
      ...(showPayForm ? [{ id: 'paymentForm', label: t('admin:pay_section_corporate') }] : []),
      { id: 'wxPay', label: t('admin:pay_section_wx') },
      { id: 'alipay', label: t('admin:pay_section_alipay') },
      { id: 'bankPay', label: t('admin:pay_section_bank_desc') },
      { id: 'billingNotify', label: t('admin:pay_section_notify_sms') }
    ],
    [t, showFeatureSection, showPayForm]
  );

  const {
    revision,
    effectiveConfig,
    overrides: commercialOverrides,
    isLoading,
    isUpdating,
    refetch
  } = useDomainConfig('commercial');
  const plansRef = useRef<PlansSettingSectionHandle>(null);

  const { control, handleSubmit, reset, register } = useForm<CommercialConfigForm>({
    defaultValues: effectiveConfig
  });

  useEffect(() => {
    if (effectiveConfig && Object.keys(effectiveConfig).length > 0) {
      reset(effectiveConfig);
    }
  }, [effectiveConfig, reset]);

  const { runAsync: onSaveBatch, loading: isBatchSaving } = useAdminConfigSaveRequest(
    async (formData: CommercialConfigForm) => {
      // 1. 先做套餐表单校验并拿到数据：若校验失败（返回 undefined）直接中断，不提交任何请求。
      // 必须抛 ToastHandledError 而不是 return：return 对 useRequest 是成功 resolve，
      // 会误弹「保存配置成功」；该错误类在 onError 中被静默跳过（RHF 已给字段级提示）。
      const plansData = await plansRef.current?.getSubPlansData();
      if (plansData === undefined) throw new ToastHandledError('Plans validation failed');

      // 套餐和 commercial revision 分开读取，提交前必须再次确认二者来自同一版本；
      // 不一致时不能用旧套餐快照写入，直接提示刷新后重试。
      if (plansData.subPlans !== undefined && plansData.subPlansExpectedRevision !== revision) {
        toast({
          status: 'warning',
          title: t('admin:revision_conflict_refresh_required')
        });
        void refetch();
        void plansRef.current?.reload();
        throw new ToastHandledError('Plans revision conflict');
      }

      // 2. 只提交当前可见字段，并与库中 overrides 深合并：
      // 隐藏字段和未编辑的嵌套字段保持原值，不因显示开关被清空或重置。
      const billingNotify = structuredClone(formData.billingNotify);
      if (!showFreeClean) {
        delete (billingNotify as Partial<typeof billingNotify>).freeClean;
      }
      const visibleOverrides: DeepPartial<CommercialConfigForm> = {
        ...(showCoupon ? { showCoupon: Boolean(formData.showCoupon) } : {}),
        ...(showDiscountCoupon ? { showDiscountCoupon: Boolean(formData.showDiscountCoupon) } : {}),
        ...(showPayForm ? { payFormUrl: formData.payFormUrl || '' } : {}),
        payment: formData.payment,
        billingNotify
      };
      const overrides = deepMergeConfig(
        filterConfigDataByEdition('commercial', commercialOverrides) as Record<string, unknown>,
        visibleOverrides as Record<string, unknown>
      );

      // 3. 商业配置与套餐合并为单个批量事务请求原子提交：
      // 任一校验失败、revision 冲突或写入异常，整体回滚，杜绝半生效状态。
      // 套餐未读取成功时 plansData 不带 subPlans 键，后端按"未提供"保留存量套餐；
      // subPlans 是整字段替换，不能把读取失败写成用户清空套餐。
      await updateDomainConfigApi({
        items: [
          {
            domain: 'commercial',
            expectedRevision: revision,
            overrides
          }
        ],
        ...plansData
      });

      // 数据库提交成功即保存成功；刷新页面数据是后续动作，失败不能反向误报为保存失败
      void Promise.allSettled([
        Promise.resolve(refetch()),
        Promise.resolve(plansRef.current?.reload())
      ]);
    },
    {
      // admin:save_success 从未在任何语言定义（显示字面量 key）；改用与
      // auth/core/limits 页一致的 raw key 风格，useRequest 内部会走 i18n
      successToast: 'admin:settings_saved',
      errorToast: 'admin:failed_to_save_settings'
    }
  );

  // 在点击时再包装，避免 render 期创建会读取 ref 的提交闭包
  const onSave = useCallback(() => {
    // onSaveBatch 的错误已由 useAdminConfigSaveRequest 统一提示；
    // 这里吞掉事件边界的 rejection，避免 ToastHandledError 变成未处理异常。
    void handleSubmit(onSaveBatch)().catch(() => undefined);
  }, [handleSubmit, onSaveBatch]);

  return (
    <AdminSettingPage
      headerTitle={t('admin:page_title_pay')}
      tocItems={tocItems}
      isLoading={isLoading}
      isSaving={isUpdating || isBatchSaving}
      onSave={onSave}
    >
      {/* 1. 订阅套餐：套餐等级、积分包与活动配置 */}
      <AdminSettingSection id="plans" title={t('admin:pay_section_plans')}>
        <PlansSettingSection ref={plansRef} />
      </AdminSettingSection>

      {/* 2. 功能展示：优惠券策略（SaaS 运营字段） */}
      {showFeatureSection && (
        <AdminSettingSection id="features" title={t('admin:pay_section_features')} showDivider>
          <SimpleGrid columns={[1, 2]} spacingX={16} spacingY={4}>
            {showCoupon && (
              <Controller
                name="showCoupon"
                control={control}
                render={({ field }) => (
                  <AdminSwitchRow
                    label={t('admin:show_recharge_coupons')}
                    tooltip={t(
                      'admin:show_coupon_redemption_and_available_coupon_entries_on_the_r'
                    )}
                    isChecked={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            )}

            {showDiscountCoupon && (
              <Controller
                name="showDiscountCoupon"
                control={control}
                render={({ field }) => (
                  <AdminSwitchRow
                    label={t('admin:show_discount_coupons')}
                    tooltip={t(
                      'admin:show_instant_discounts_and_coupon_options_during_user_checko'
                    )}
                    isChecked={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            )}
          </SimpleGrid>
        </AdminSettingSection>
      )}

      {/* 3. 对公收款配置（SaaS 运营字段） */}
      {showPayForm && (
        <AdminSettingSection id="paymentForm" title={t('admin:pay_section_corporate')} showDivider>
          <AdminFormItem
            label={t('admin:bank_transfer_corporate_form_url')}
            tooltip={t('admin:full_url_of_the_corporate_form_a_user_fills_in_for_large_ban')}
          >
            <Input {...register('payFormUrl')} placeholder="https://form.example.com/pay" />
          </AdminFormItem>
        </AdminSettingSection>
      )}

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
            label={t('admin:low_balance_alert_chinese_template')}
            tooltip={t('admin:sms_template_id_for_low_points_balance_alert_chinese')}
          >
            <Input {...register('billingNotify.lackOfPoints.zh')} placeholder="SMS_xxx" />
          </AdminFormItem>
          <AdminFormItem label={t('admin:points_thirty_percent_remain_template')}>
            <Input
              {...register('billingNotify.pointsThirtyPercentRemain.zh')}
              placeholder="SMS_xxx"
            />
          </AdminFormItem>
          <AdminFormItem
            label={t('admin:points_running_out_chinese_template')}
            tooltip={t('admin:sms_template_id_for_10_points_remaining_reminder_chinese')}
          >
            <Input {...register('billingNotify.pointsTenPercentRemain.zh')} placeholder="SMS_xxx" />
          </AdminFormItem>
          {showFreeClean && (
            <AdminFormItem label={t('admin:free_clean_template')}>
              <Input {...register('billingNotify.freeClean.zh')} placeholder="SMS_xxx" />
            </AdminFormItem>
          )}
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
