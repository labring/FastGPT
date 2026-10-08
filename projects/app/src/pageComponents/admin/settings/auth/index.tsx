import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import React, { useEffect, useMemo } from 'react';
import {
  Input,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  SimpleGrid,
  Box,
  Text,
  useToast
} from '@chakra-ui/react';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { useDomainConfig } from '@/web/common/system/useDomainConfig';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import {
  AdminSettingPage,
  AdminSettingSection,
  AdminFormItem,
  AdminSwitchRow,
  type SettingTOCItem
} from '@/pageComponents/admin/settings';
import type { SystemInstanceConfigDomainMap } from '@fastgpt/global/common/system/config';

type AuthConfigForm = Omit<SystemInstanceConfigDomainMap['auth'], 'fastLogin'> & {
  /** 登录防护字段属 security 域，页面迁入后在此一并编辑 */
  passwordLoginMinuteLimitCount: SystemInstanceConfigDomainMap['security']['passwordLoginMinuteLimitCount'];
  maxLoginSession: SystemInstanceConfigDomainMap['security']['maxLoginSession'];
};

const AuthSettingComponent = () => {
  const { t } = useClientTranslation('admin');
  const tocItems: SettingTOCItem[] = useMemo(
    () => [
      { id: 'apiAndPassword', label: t('admin:api_password_policy') },
      { id: 'loginAndTeam', label: t('admin:login_policy') },
      { id: 'loginProtection', label: t('admin:auth_section_protection') },
      { id: 'smsLogin', label: t('admin:sms_verification_code') },
      { id: 'wechatLogin', label: t('admin:wechat_service_account_wecom') },
      { id: 'oauthLogin', label: t('admin:oauth_login') },
      { id: 'accountCancellation', label: t('admin:account_cancellation') }
    ],
    [t]
  );

  const auth = useDomainConfig('auth');
  const security = useDomainConfig('security');
  const { effectiveConfig } = auth;
  const isLoading = auth.isLoading || security.isLoading;
  const toast = useToast();

  const { control, handleSubmit, reset, register } = useForm<AuthConfigForm>({
    defaultValues: {
      ...effectiveConfig,
      passwordLoginMinuteLimitCount: 10,
      maxLoginSession: 10
    }
  });

  const emailRegister = useWatch({ control, name: 'loginProviders.email.register' });

  useEffect(() => {
    if (effectiveConfig && Object.keys(effectiveConfig).length > 0) {
      reset({
        ...effectiveConfig,
        passwordLoginMinuteLimitCount:
          security.effectiveConfig?.passwordLoginMinuteLimitCount ?? 10,
        maxLoginSession: security.effectiveConfig?.maxLoginSession ?? 10
      });
    }
  }, [effectiveConfig, security.effectiveConfig, reset]);

  const { runAsync: submitAuthConfig, loading: isSaving } = useRequest(
    async (formData: AuthConfigForm) => {
      const { passwordLoginMinuteLimitCount, maxLoginSession, ...rest } = formData;

      // 局部提交：团队模式、OpenAPI Key 上限等字段已由核心配置 / 限制与并发页管理，
      // 整域提交会把它们重置为默认值。
      await auth.patchConfig(
        {
          wecomLoginAutoRedirect: Boolean(rest.wecomLoginAutoRedirect),
          // 密码过期月数：0 或 NaN 转为 null
          passwordExpiredMonth:
            rest.passwordExpiredMonth && Number(rest.passwordExpiredMonth) > 0
              ? Number(rest.passwordExpiredMonth)
              : null,
          loginProviders: rest.loginProviders,
          accountCancellation: rest.accountCancellation
        },
        { silent: true }
      );

      // 登录防护字段属 security 域
      await security.patchConfig(
        {
          passwordLoginMinuteLimitCount: Number(passwordLoginMinuteLimitCount) || 10,
          maxLoginSession: Number(maxLoginSession) || 10
        },
        { silent: true }
      );
    },
    {
      successToast: 'admin:settings_saved',
      errorToast: 'admin:failed_to_save_settings',
      onSuccess: () => {
        void auth.refetch();
        void security.refetch();
      }
    }
  );

  return (
    <AdminSettingPage
      headerTitle={t('admin:page_title_auth')}
      tocItems={tocItems}
      isLoading={isLoading}
      isSaving={isSaving}
      onSave={handleSubmit(submitAuthConfig)}
    >
      {/* 1. API 与密码策略 */}
      <AdminSettingSection id="apiAndPassword" title={t('admin:api_password_policy')}>
        <AdminFormItem
          label={t('admin:password_validity_period_months')}
          tooltip={t('admin:password_validity_period_desc')}
          mb={6}
        >
          <Controller
            name="passwordExpiredMonth"
            control={control}
            render={({ field }) => (
              <NumberInput
                variant={'whiteOutline'}
                maxW={'400px'}
                min={0}
                max={120}
                value={field.value ?? ''}
                onChange={(_, val) => field.onChange(isNaN(val) || val <= 0 ? null : val)}
              >
                <NumberInputField placeholder={t('admin:leave_empty_to_never_expire')} />
                <NumberInputStepper>
                  <NumberIncrementStepper />
                  <NumberDecrementStepper />
                </NumberInputStepper>
              </NumberInput>
            )}
          />
        </AdminFormItem>
      </AdminSettingSection>

      {/* 2. 登录策略 */}
      <AdminSettingSection id="loginAndTeam" title={t('admin:login_policy')} showDivider>
        <SimpleGrid columns={[1, 2]} spacingX={16} spacingY={4}>
          <Controller
            name="wecomLoginAutoRedirect"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label={t('admin:wecom_auto_redirect')}
                tooltip={t('admin:auto_redirect_to_wecom_oauth_quick_login_when_the_login_page')}
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </SimpleGrid>
      </AdminSettingSection>

      {/* 3. 登录防护 */}
      <AdminSettingSection
        id="loginProtection"
        title={t('admin:auth_section_protection')}
        showDivider
      >
        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem
            label={t('admin:password_login_rate_limit_per_minute')}
            tooltip={t('admin:max_failed_password_login_attempts_per_account_per_minute')}
            isRequired
          >
            <Controller
              name="passwordLoginMinuteLimitCount"
              control={control}
              render={({ field }) => (
                <NumberInput
                  variant={'whiteOutline'}
                  min={1}
                  max={100}
                  value={field.value ?? 10}
                  onChange={(_, val) => field.onChange(val || 10)}
                >
                  <NumberInputField />
                  <NumberInputStepper>
                    <NumberIncrementStepper />
                    <NumberDecrementStepper />
                  </NumberInputStepper>
                </NumberInput>
              )}
            />
          </AdminFormItem>

          <AdminFormItem
            label={t('admin:max_login_sessions')}
            tooltip={t('admin:max_concurrent_active_sessions_per_user_the_earliest_session')}
            isRequired
          >
            <Controller
              name="maxLoginSession"
              control={control}
              render={({ field }) => (
                <NumberInput
                  variant={'whiteOutline'}
                  min={1}
                  max={100}
                  value={field.value ?? 10}
                  onChange={(_, val) => field.onChange(val || 10)}
                >
                  <NumberInputField />
                  <NumberInputStepper>
                    <NumberIncrementStepper />
                    <NumberDecrementStepper />
                  </NumberInputStepper>
                </NumberInput>
              )}
            />
          </AdminFormItem>
        </SimpleGrid>
      </AdminSettingSection>

      {/* 4. 邮箱通知 (SMTP) */}
      <AdminSettingSection id="emailLogin" title={t('admin:email_notification_config')} showDivider>
        <SimpleGrid columns={[1, 2]} spacingX={16} spacingY={4}>
          <Controller
            name="loginProviders.email.register"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label={t('admin:enable_email_self_registration')}
                tooltip={t('admin:allow_users_to_register_with_email')}
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </SimpleGrid>

        {emailRegister && (
          <Text fontSize={'xs'} color={'myGray.500'} mt={2}>
            {t('admin:ensure_the_smtp_configuration_is_complete_and_working_otherw')}
          </Text>
        )}
      </AdminSettingSection>

      {/* 5. 短信验证码 */}
      <AdminSettingSection id="smsLogin" title={t('admin:sms_verification_code')} showDivider>
        <Text fontSize={'xs'} color={'myGray.500'} mb={3}>
          {t('admin:sms_templates_fill_in_the_template_ids_approved_in_the_aliyu')}
        </Text>

        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem
            label={t('admin:login_code_chinese_template')}
            tooltip={t('admin:sms_template_id_for_login_chinese')}
          >
            <Input {...register('loginProviders.sms.login.zh')} placeholder="SMS_xxx" />
          </AdminFormItem>
          <AdminFormItem
            label={t('admin:registration_code_chinese_template')}
            tooltip={t('admin:sms_template_id_for_registration_chinese')}
          >
            <Input {...register('loginProviders.sms.register.zh')} placeholder="SMS_xxx" />
          </AdminFormItem>
          <AdminFormItem
            label={t('admin:reset_password_chinese_template')}
            tooltip={t('admin:sms_template_id_for_password_reset_chinese')}
          >
            <Input {...register('loginProviders.sms.resetPassword.zh')} placeholder="SMS_xxx" />
          </AdminFormItem>
          <AdminFormItem
            label={t('admin:change_password_chinese_template')}
            tooltip={t('admin:sms_template_id_for_password_change_chinese')}
          >
            <Input {...register('loginProviders.sms.changePassword.zh')} placeholder="SMS_xxx" />
          </AdminFormItem>
          <AdminFormItem
            label={t('admin:binding_notification_chinese_template')}
            tooltip={t('admin:sms_template_id_for_binding_notification_methods_chinese')}
          >
            <Input {...register('loginProviders.sms.bindNotification.zh')} placeholder="SMS_xxx" />
          </AdminFormItem>
        </SimpleGrid>
      </AdminSettingSection>

      {/* 6. 微信服务号 / 企业微信 */}
      <AdminSettingSection
        id="wechatLogin"
        title={t('admin:wechat_service_account_wecom')}
        showDivider
      >
        <SimpleGrid columns={[1, 2]} spacing={5} mb={6}>
          <AdminFormItem
            label={t('admin:wechat_service_account_appid')}
            tooltip={t('admin:official_account_app_id')}
          >
            <Input {...register('loginProviders.wechat.appId')} placeholder="wx******" />
          </AdminFormItem>
          <AdminFormItem
            label={t('admin:wechat_service_account_appsecret')}
            tooltip={t('admin:official_account_app_secret')}
          >
            <Input
              type="password"
              {...register('loginProviders.wechat.appSecret')}
              placeholder="******"
            />
          </AdminFormItem>
        </SimpleGrid>

        <Text fontSize={'xs'} color={'myGray.500'} mb={3}>
          {t('admin:wecom_third_party_app_service_provider_integration_settings')}
        </Text>

        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem label="SuiteId" tooltip={t('admin:wecom_service_provider_suiteid')}>
            <Input {...register('loginProviders.wecom.suiteId')} placeholder="ww******" />
          </AdminFormItem>
          <AdminFormItem label="SuiteSecret" tooltip={t('admin:wecom_service_provider_app_secret')}>
            <Input
              type="password"
              {...register('loginProviders.wecom.secret')}
              placeholder="******"
            />
          </AdminFormItem>
          <AdminFormItem label="Token" tooltip={t('admin:callback_token')}>
            <Input
              type="password"
              {...register('loginProviders.wecom.token')}
              placeholder="******"
            />
          </AdminFormItem>
          <AdminFormItem label="EncodingAESKey" tooltip={t('admin:callback_encryption_key')}>
            <Input
              type="password"
              {...register('loginProviders.wecom.encodingAESKey')}
              placeholder="******"
            />
          </AdminFormItem>
          <AdminFormItem
            label={t('admin:enterprise_corpid')}
            tooltip={t('admin:wecom_enterprise_unique_identifier')}
          >
            <Input {...register('loginProviders.wecom.corpId')} placeholder="ww******" />
          </AdminFormItem>
          <AdminFormItem
            label={t('admin:service_provider_secret')}
            tooltip={t('admin:service_provider_level_key')}
          >
            <Input
              type="password"
              {...register('loginProviders.wecom.providerSecret')}
              placeholder="******"
            />
          </AdminFormItem>
        </SimpleGrid>
      </AdminSettingSection>

      {/* 7. OAuth 登录 */}
      <AdminSettingSection id="oauthLogin" title={t('admin:oauth_login')} showDivider>
        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem label="GitHub Client ID" tooltip={t('admin:github_oauth_app_client_id')}>
            <Input {...register('loginProviders.github.clientId')} placeholder="******" />
          </AdminFormItem>
          <AdminFormItem
            label="GitHub Client Secret"
            tooltip={t('admin:github_oauth_app_client_secret')}
          >
            <Input
              type="password"
              {...register('loginProviders.github.secret')}
              placeholder="******"
            />
          </AdminFormItem>
          <AdminFormItem label="Google Client ID" tooltip={t('admin:google_oauth_2_0_client_id')}>
            <Input {...register('loginProviders.google.clientId')} placeholder="******" />
          </AdminFormItem>
          <AdminFormItem
            label="Google Client Secret"
            tooltip={t('admin:google_oauth_2_0_client_secret')}
          >
            <Input
              type="password"
              {...register('loginProviders.google.secret')}
              placeholder="******"
            />
          </AdminFormItem>
          <AdminFormItem
            label="Microsoft Client ID"
            tooltip={t('admin:azure_ad_application_client_id')}
          >
            <Input {...register('loginProviders.microsoft.clientId')} placeholder="******" />
          </AdminFormItem>
          <AdminFormItem
            label="Microsoft Client Secret"
            tooltip={t('admin:azure_ad_application_client_secret')}
          >
            <Input
              type="password"
              {...register('loginProviders.microsoft.secret')}
              placeholder="******"
            />
          </AdminFormItem>
          <AdminFormItem
            label="Microsoft Tenant ID"
            tooltip={t('admin:azure_ad_tenant_id_use_common_for_multi_tenant')}
          >
            <Input {...register('loginProviders.microsoft.tenantId')} placeholder="common" />
          </AdminFormItem>
          <AdminFormItem
            label={t('admin:microsoft_custom_button_text')}
            tooltip={t('admin:custom_copy_shown_on_the_login_button')}
          >
            <Input
              {...register('loginProviders.microsoft.customButton')}
              placeholder={t('admin:sign_in_with_microsoft')}
            />
          </AdminFormItem>
          <AdminFormItem
            label={t('admin:dingtalk_client_id')}
            tooltip={t('admin:dingtalk_open_platform_app_client_id')}
          >
            <Input {...register('loginProviders.dingtalk.clientId')} placeholder="ding******" />
          </AdminFormItem>
          <AdminFormItem
            label={t('admin:dingtalk_client_secret')}
            tooltip={t('admin:dingtalk_open_platform_app_secret')}
          >
            <Input
              type="password"
              {...register('loginProviders.dingtalk.secret')}
              placeholder="******"
            />
          </AdminFormItem>
        </SimpleGrid>
      </AdminSettingSection>

      {/* 8. 快速登录与账号注销 */}
      <AdminSettingSection
        id="accountCancellation"
        title={t('admin:account_cancellation')}
        showDivider
      >
        <SimpleGrid columns={[1, 2]} spacingX={16} spacingY={4} mb={6}>
          <Controller
            name="accountCancellation.enabled"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label={t('admin:enable_account_cancellation')}
                tooltip={t('admin:allow_users_to_self_submit_account_cancellation_requests')}
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </SimpleGrid>

        <Text fontSize={'xs'} color={'myGray.500'} mb={3}>
          {t('admin:sms_templates_for_the_cancellation_flow_apply_for_template_i')}
        </Text>

        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem
            label={t('admin:cancellation_request_chinese_template')}
            tooltip={t('admin:sms_template_id_for_cancellation_submission_chinese')}
          >
            <Input {...register('accountCancellation.cancellationSm.zh')} placeholder="SMS_xxx" />
          </AdminFormItem>
          <AdminFormItem
            label={t('admin:cancellation_reminder_chinese_template')}
            tooltip={t('admin:sms_template_id_for_cancellation_cooling_off_reminder_chines')}
          >
            <Input {...register('accountCancellation.reminderSm.zh')} placeholder="SMS_xxx" />
          </AdminFormItem>
          <AdminFormItem
            label={t('admin:same_day_cancellation_chinese_template')}
            tooltip={t('admin:sms_template_id_for_cancellation_effective_date_chinese')}
          >
            <Input {...register('accountCancellation.todaySm.zh')} placeholder="SMS_xxx" />
          </AdminFormItem>
        </SimpleGrid>
      </AdminSettingSection>
    </AdminSettingPage>
  );
};

export default React.memo(AuthSettingComponent);
