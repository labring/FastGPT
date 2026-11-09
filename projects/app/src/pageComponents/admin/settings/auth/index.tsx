import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Input,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  SimpleGrid,
  Text,
  Textarea
} from '@chakra-ui/react';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { useDomainConfig, updateDomainConfigApi } from '@/web/common/system/useDomainConfig';
import { useAdminPermission } from '@/pageComponents/admin/useAdminPermission';
import { deepMergeConfig } from '@fastgpt/global/common/system/config/merge';
import { ToastHandledError } from '@fastgpt/global/common/error/utils';
import { useAdminConfigSaveRequest } from '@/web/common/system/useAdminConfigSaveRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import AdminSettingPage from '@/pageComponents/admin/settings/AdminSettingPage';
import AdminSettingSection from '@/pageComponents/admin/settings/AdminSettingSection';
import AdminFormItem from '@/pageComponents/admin/settings/AdminFormItem';
import AdminSwitchRow from '@/pageComponents/admin/settings/AdminSwitchRow';
import ImageInput from '@/pageComponents/admin/settings/ImageInput';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { SettingTOCItem } from '@/pageComponents/admin/settings/AdminSettingTOC';
import type { SystemInstanceConfigDomainMap } from '@fastgpt/global/common/system/config/schema';

type AuthConfigForm = SystemInstanceConfigDomainMap['auth'] & {
  /** 登录防护字段属 security 域，页面迁入后在此一并编辑 */
  passwordLoginMinuteLimitCount: SystemInstanceConfigDomainMap['security']['passwordLoginMinuteLimitCount'];
  maxLoginSession: SystemInstanceConfigDomainMap['security']['maxLoginSession'];
};

const AuthSettingComponent = () => {
  const { t } = useSafeTranslation();
  const { isFieldVisible, filterConfigData, filterConfigDataByEdition } = useAdminPermission();
  const { toast } = useToast();
  const { feConfigs, licenseData } = useSystemStore();

  const showEmail = isFieldVisible('auth.loginProviders.email.register');
  const showSms = isFieldVisible('auth.loginProviders.sms.login.zh');
  const showWechat = isFieldVisible('auth.loginProviders.wechat.appId');
  const showOauth = isFieldVisible('auth.loginProviders.github.clientId');
  const showCancellation = isFieldVisible('auth.accountCancellation.enabled');
  const showWecomProviderSecret = isFieldVisible('auth.loginProviders.wecom.providerSecret');
  const showWecomSaaS = isFieldVisible('auth.loginProviders.wecom.buyerUserId');
  const showFastLoginPermission = isFieldVisible('auth.fastLogin');
  const showSso = Boolean(
    isFieldVisible('auth.sso.title') && licenseData?.functions?.sso && feConfigs?.sso?.enabled
  );

  const auth = useDomainConfig('auth');
  const security = useDomainConfig('security');
  const { effectiveConfig } = auth;
  const isLoading = auth.isLoading || security.isLoading;

  // 仅当加载时既有 fastLogin 非空才显示编辑器和目录项；不能跟随当前草稿即时变化。
  const showFastLogin = showFastLoginPermission && (effectiveConfig.fastLogin?.length ?? 0) > 0;

  const tocItems: SettingTOCItem[] = useMemo(
    () => [
      { id: 'apiAndPassword', label: t('admin:api_password_policy') },
      { id: 'loginAndTeam', label: t('admin:login_policy') },
      { id: 'loginProtection', label: t('admin:auth_section_protection') },
      ...(showEmail ? [{ id: 'emailLogin', label: t('admin:email_notification_config') }] : []),
      ...(showSms ? [{ id: 'smsLogin', label: t('admin:sms_verification_code') }] : []),
      ...(showWechat
        ? [{ id: 'wechatLogin', label: t('admin:wechat_service_account_wecom') }]
        : []),
      ...(showOauth ? [{ id: 'oauthLogin', label: t('admin:oauth_login') }] : []),
      ...(showSso ? [{ id: 'ssoLogin', label: t('admin:sso_settings') }] : []),
      ...(showFastLogin ? [{ id: 'fastLogin', label: t('admin:fast_login_entries_json') }] : []),
      ...(showCancellation
        ? [{ id: 'accountCancellation', label: t('admin:account_cancellation') }]
        : [])
    ],
    [t, showEmail, showSms, showWechat, showOauth, showSso, showFastLogin, showCancellation]
  );

  const { control, handleSubmit, reset, register, setValue } = useForm<AuthConfigForm>({
    defaultValues: {
      ...effectiveConfig,
      passwordLoginMinuteLimitCount: 10,
      maxLoginSession: 10
    }
  });

  const emailRegister = useWatch({ control, name: 'loginProviders.email.register' });
  const ssoAutoLogin = useWatch({ control, name: 'sso.autoLogin' });
  const ssoDisablePassword = useWatch({ control, name: 'sso.disablePasswordForSsoUsers' });
  const [fastLoginText, setFastLoginText] = useState('');

  useEffect(() => {
    if (effectiveConfig && Object.keys(effectiveConfig).length > 0) {
      reset({
        ...effectiveConfig,
        passwordLoginMinuteLimitCount:
          security.effectiveConfig?.passwordLoginMinuteLimitCount ?? 10,
        maxLoginSession: security.effectiveConfig?.maxLoginSession ?? 10
      });
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFastLoginText(JSON.stringify(effectiveConfig.fastLogin ?? [], null, 2));
    }
  }, [effectiveConfig, security.effectiveConfig, reset]);

  const { runAsync: submitAuthConfig, loading: isSaving } = useAdminConfigSaveRequest(
    async (formData: AuthConfigForm) => {
      const { passwordLoginMinuteLimitCount, maxLoginSession, ...rest } = formData;
      let fastLogin: unknown;
      if (showFastLogin) {
        try {
          fastLogin = JSON.parse(fastLoginText || '[]');
        } catch {
          toast({
            status: 'error',
            title: t('admin:fast_login_entries_must_be_valid_json_array')
          });
          throw new ToastHandledError('Invalid fastLogin JSON');
        }
        if (!Array.isArray(fastLogin)) {
          toast({
            status: 'error',
            title: t('admin:fast_login_entries_must_be_valid_json_array')
          });
          throw new ToastHandledError('Invalid fastLogin JSON');
        }
      }

      // 单次请求、单个数据库事务原子保存 auth 与 security 两个域，避免分步提交导致半写状态。
      // 深度合并保留同域未在当前页编辑的字段（如 teamMode、OpenAPI Key 上限、CORS 等）及密钥。
      const authOverrides = deepMergeConfig(
        filterConfigDataByEdition('auth', auth.overrides) as Record<string, unknown>,
        filterConfigData('auth', {
          wecomLoginAutoRedirect: Boolean(rest.wecomLoginAutoRedirect),
          passwordExpiredMonth:
            rest.passwordExpiredMonth && Number(rest.passwordExpiredMonth) > 0
              ? Number(rest.passwordExpiredMonth)
              : null,
          loginProviders: rest.loginProviders,
          accountCancellation: rest.accountCancellation,
          ...(showSso ? { sso: rest.sso } : {}),
          ...(showFastLogin ? { fastLogin } : {})
        })
      );

      const securityOverrides = deepMergeConfig(
        filterConfigDataByEdition('security', security.overrides) as Record<string, unknown>,
        {
          passwordLoginMinuteLimitCount: Number(passwordLoginMinuteLimitCount) || 10,
          maxLoginSession: Number(maxLoginSession) || 10
        }
      );

      await updateDomainConfigApi({
        items: [
          {
            domain: 'auth',
            expectedRevision: auth.revision,
            overrides: authOverrides
          },
          {
            domain: 'security',
            expectedRevision: security.revision,
            overrides: securityOverrides
          }
        ]
      });
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
      {showEmail && (
        <AdminSettingSection
          id="emailLogin"
          title={t('admin:email_notification_config')}
          showDivider
        >
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
      )}

      {/* 5. 短信验证码 */}
      {showSms && (
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
              <Input
                {...register('loginProviders.sms.bindNotification.zh')}
                placeholder="SMS_xxx"
              />
            </AdminFormItem>
          </SimpleGrid>
        </AdminSettingSection>
      )}

      {/* 6. 微信服务号 / 企业微信 */}
      {showWechat && (
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
            <AdminFormItem
              label="SuiteSecret"
              tooltip={t('admin:wecom_service_provider_app_secret')}
            >
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
            {showWecomProviderSecret && (
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
            )}
            {showWecomSaaS && (
              <>
                <AdminFormItem label={t('admin:wecom_buyer_user_id')}>
                  <Input {...register('loginProviders.wecom.buyerUserId')} placeholder="userid" />
                </AdminFormItem>
                <AdminFormItem label={t('admin:wecom_basic_version_id')}>
                  <Input
                    {...register('loginProviders.wecom.basicVersionId')}
                    placeholder="基础版版本ID"
                  />
                </AdminFormItem>
                <AdminFormItem label={t('admin:wecom_advanced_version_id')}>
                  <Input
                    {...register('loginProviders.wecom.advancedVersionId')}
                    placeholder="高级版版本ID"
                  />
                </AdminFormItem>
                <AdminFormItem label={t('admin:wecom_pay_secret')}>
                  <Input
                    type="password"
                    {...register('loginProviders.wecom.paySecret')}
                    placeholder="******"
                  />
                </AdminFormItem>
              </>
            )}
          </SimpleGrid>
        </AdminSettingSection>
      )}

      {/* 7. OAuth 登录 */}
      {showOauth && (
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
          </SimpleGrid>
        </AdminSettingSection>
      )}

      {/* 8. SSO 展示配置 */}
      {showSso && (
        <AdminSettingSection id="ssoLogin" title={t('admin:sso_settings')} showDivider>
          <SimpleGrid columns={[1, 2]} spacing={5}>
            <AdminFormItem label={t('admin:sso_login_button_title')}>
              <Input {...register('sso.title')} placeholder={t('admin:sso_login_button_title')} />
            </AdminFormItem>
            <AdminFormItem label={t('admin:sso_login_button_icon')}>
              <ImageInput control={control} name="sso.icon" />
            </AdminFormItem>
            <AdminSwitchRow
              label={t('admin:sso_auto_login')}
              tooltip={t('admin:sso_auto_login_tip')}
              isChecked={ssoAutoLogin}
              onChange={(value) => setValue('sso.autoLogin', value)}
            />
            <AdminSwitchRow
              label={t('admin:disable_password_for_sso_users')}
              tooltip={t('admin:disable_password_for_sso_users_tip')}
              isChecked={ssoDisablePassword}
              onChange={(value) => setValue('sso.disablePasswordForSsoUsers', value)}
            />
          </SimpleGrid>
        </AdminSettingSection>
      )}

      {/* 9. 快速登录 */}
      {showFastLogin && (
        <AdminSettingSection id="fastLogin" title={t('admin:fast_login_entries_json')} showDivider>
          <AdminFormItem
            label={t('admin:fast_login_entries_json')}
            tooltip={t('admin:array_format_each_item_contains_key_authurl_used_for_custom')}
            mb={0}
          >
            <Controller
              name="fastLogin"
              control={control}
              render={() => (
                <Textarea
                  value={fastLoginText}
                  onChange={(event) => setFastLoginText(event.target.value)}
                  rows={8}
                  fontFamily={'mono'}
                  placeholder='[{"key":"sso","authUrl":"https://example.com/login"}]'
                />
              )}
            />
          </AdminFormItem>
        </AdminSettingSection>
      )}

      {/* 8. 快速登录与账号注销 */}
      {showCancellation && (
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
      )}
    </AdminSettingPage>
  );
};

export default React.memo(AuthSettingComponent);
