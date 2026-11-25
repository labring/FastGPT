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
import AdminSecretInput from '@/pageComponents/admin/settings/AdminSecretInput';
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

  const showPasswordSecurity = isFieldVisible('auth.passwordExpiredMonth');
  const showLoginProtection = isFieldVisible('security.passwordLoginMinuteLimitCount');
  const showEmail = isFieldVisible('auth.loginProviders.email.register');
  const showSms = isFieldVisible('auth.loginProviders.sms.login.zh');
  const showWechat = isFieldVisible('auth.loginProviders.wechat.appId');
  const showWecom = isFieldVisible('auth.loginProviders.wecom.suiteId');
  const showGithub = isFieldVisible('auth.loginProviders.github.clientId');
  const showGoogle = isFieldVisible('auth.loginProviders.google.clientId');
  const showMicrosoft = isFieldVisible('auth.loginProviders.microsoft.clientId');
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

  // 已弃用功能只为仍有配置的旧实例保留编辑/清空入口；按已保存值判断，避免清空草稿时立即消失。
  const showFastLogin =
    showFastLoginPermission &&
    Array.isArray(effectiveConfig.fastLogin) &&
    effectiveConfig.fastLogin.length > 0;

  const tocItems: SettingTOCItem[] = useMemo(
    () => [
      ...(showPasswordSecurity
        ? [{ id: 'passwordSecurity', label: t('admin:password_security') }]
        : []),
      ...(showLoginProtection
        ? [{ id: 'loginProtection', label: t('admin:auth_section_protection') }]
        : []),
      ...(showCancellation
        ? [{ id: 'accountCancellation', label: t('admin:account_cancellation') }]
        : []),
      ...(showEmail ? [{ id: 'emailLogin', label: t('admin:email_registration') }] : []),
      ...(showSms ? [{ id: 'smsLogin', label: t('admin:sms_verification_code') }] : []),
      ...(showWechat
        ? [{ id: 'wechatLogin', label: t('admin:wechat_service_account_login') }]
        : []),
      ...(showWecom ? [{ id: 'wecomLogin', label: t('admin:wecom_login') }] : []),
      ...(showGithub ? [{ id: 'githubLogin', label: t('admin:github_login') }] : []),
      ...(showGoogle ? [{ id: 'googleLogin', label: t('admin:google_login') }] : []),
      ...(showMicrosoft ? [{ id: 'microsoftLogin', label: t('admin:microsoft_login') }] : []),
      ...(showSso ? [{ id: 'ssoLogin', label: t('admin:sso_settings') }] : []),
      ...(showFastLogin ? [{ id: 'fastLogin', label: t('admin:fast_login_entries_json') }] : [])
    ],
    [
      t,
      showPasswordSecurity,
      showLoginProtection,
      showEmail,
      showSms,
      showWechat,
      showWecom,
      showGithub,
      showGoogle,
      showMicrosoft,
      showSso,
      showFastLogin,
      showCancellation
    ]
  );

  const form = useForm<AuthConfigForm>({
    defaultValues: {
      ...effectiveConfig,
      passwordLoginMinuteLimitCount: 10,
      maxLoginSession: 10
    }
  });
  const { control, handleSubmit, reset, register, setValue } = form;

  const emailRegister = useWatch({ control, name: 'loginProviders.email.register' });
  const ssoAutoLogin = useWatch({ control, name: 'sso.autoLogin' });
  const ssoDisablePassword = useWatch({ control, name: 'sso.disablePasswordForSsoUsers' });
  const [fastLoginText, setFastLoginText] = useState(() =>
    JSON.stringify(effectiveConfig.fastLogin ?? [], null, 2)
  );

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
          fastLogin = JSON.parse(fastLoginText.trim() || '[]');
        } catch {
          toast({
            status: 'error',
            title: t('admin:fast_login_entries_must_be_valid_json_array')
          });
          form.setError('fastLogin', {
            type: 'validate',
            message: t('admin:fast_login_entries_must_be_valid_json_array')
          });
          throw new ToastHandledError('Invalid fastLogin JSON');
        }
        if (!Array.isArray(fastLogin)) {
          toast({
            status: 'error',
            title: t('admin:fast_login_entries_must_be_valid_json_array')
          });
          form.setError('fastLogin', {
            type: 'validate',
            message: t('admin:fast_login_entries_must_be_valid_json_array')
          });
          throw new ToastHandledError('Invalid fastLogin JSON');
        }
      }

      // 单次请求、单个数据库事务原子保存 auth 与 security 两个域，避免分步提交导致半写状态。
      // 深度合并保留同域未在当前页编辑的字段（如 OpenAPI Key 上限等）及密钥；
      // 团队模式由 Pro ENV 控制，不提交历史 teamMode。
      const { teamMode: _preservedTeamMode, ...preservedAuthOverrides } = filterConfigDataByEdition(
        'auth',
        auth.overrides
      ) as Record<string, unknown>;
      const authOverrides = deepMergeConfig(
        preservedAuthOverrides,
        filterConfigData('auth', {
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
        filterConfigData('security', {
          passwordLoginMinuteLimitCount: Number(passwordLoginMinuteLimitCount) || 10,
          maxLoginSession: Number(maxLoginSession) || 10
        })
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

  const isFastLoginDirty =
    showFastLogin && fastLoginText !== JSON.stringify(effectiveConfig.fastLogin ?? [], null, 2);

  return (
    <AdminSettingPage
      form={form}
      headerTitle={t('admin:page_title_auth')}
      tocItems={tocItems}
      isLoading={isLoading}
      isSaving={isSaving}
      isUnsaved={isFastLoginDirty}
      onSave={handleSubmit(submitAuthConfig)}
    >
      {/* 密码安全 */}
      {showPasswordSecurity && (
        <AdminSettingSection id="passwordSecurity" title={t('admin:password_security')}>
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
                  isInvalid={Boolean(form.getFieldState(field.name, form.formState).error)}
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
      )}

      {/* 3. 登录防护 */}
      {showLoginProtection && (
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
                    isInvalid={Boolean(form.getFieldState(field.name, form.formState).error)}
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
                    isInvalid={Boolean(form.getFieldState(field.name, form.formState).error)}
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
      )}

      {/* 账号注销 */}
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
                  name={field.name}
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
              <Input
                isInvalid={Boolean(
                  form.getFieldState('accountCancellation.cancellationSm.zh', form.formState).error
                )}
                {...register('accountCancellation.cancellationSm.zh')}
                placeholder="SMS_xxx"
              />
            </AdminFormItem>
            <AdminFormItem
              label={t('admin:cancellation_reminder_chinese_template')}
              tooltip={t('admin:sms_template_id_for_cancellation_cooling_off_reminder_chines')}
            >
              <Input
                isInvalid={Boolean(
                  form.getFieldState('accountCancellation.reminderSm.zh', form.formState).error
                )}
                {...register('accountCancellation.reminderSm.zh')}
                placeholder="SMS_xxx"
              />
            </AdminFormItem>
            <AdminFormItem
              label={t('admin:same_day_cancellation_chinese_template')}
              tooltip={t('admin:sms_template_id_for_cancellation_effective_date_chinese')}
            >
              <Input
                isInvalid={Boolean(
                  form.getFieldState('accountCancellation.todaySm.zh', form.formState).error
                )}
                {...register('accountCancellation.todaySm.zh')}
                placeholder="SMS_xxx"
              />
            </AdminFormItem>
          </SimpleGrid>
        </AdminSettingSection>
      )}

      {/* 4. 邮箱注册 */}
      {showEmail && (
        <AdminSettingSection id="emailLogin" title={t('admin:email_registration')} showDivider>
          <SimpleGrid columns={[1, 2]} spacingX={16} spacingY={4}>
            <Controller
              name="loginProviders.email.register"
              control={control}
              render={({ field }) => (
                <AdminSwitchRow
                  name={field.name}
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
              <Input
                isInvalid={Boolean(
                  form.getFieldState('loginProviders.sms.login.zh', form.formState).error
                )}
                {...register('loginProviders.sms.login.zh')}
                placeholder="SMS_xxx"
              />
            </AdminFormItem>
            <AdminFormItem
              label={t('admin:registration_code_chinese_template')}
              tooltip={t('admin:sms_template_id_for_registration_chinese')}
            >
              <Input
                isInvalid={Boolean(
                  form.getFieldState('loginProviders.sms.register.zh', form.formState).error
                )}
                {...register('loginProviders.sms.register.zh')}
                placeholder="SMS_xxx"
              />
            </AdminFormItem>
            <AdminFormItem
              label={t('admin:reset_password_chinese_template')}
              tooltip={t('admin:sms_template_id_for_password_reset_chinese')}
            >
              <Input
                isInvalid={Boolean(
                  form.getFieldState('loginProviders.sms.resetPassword.zh', form.formState).error
                )}
                {...register('loginProviders.sms.resetPassword.zh')}
                placeholder="SMS_xxx"
              />
            </AdminFormItem>
            <AdminFormItem
              label={t('admin:change_password_chinese_template')}
              tooltip={t('admin:sms_template_id_for_password_change_chinese')}
            >
              <Input
                isInvalid={Boolean(
                  form.getFieldState('loginProviders.sms.changePassword.zh', form.formState).error
                )}
                {...register('loginProviders.sms.changePassword.zh')}
                placeholder="SMS_xxx"
              />
            </AdminFormItem>
            <AdminFormItem
              label={t('admin:binding_notification_chinese_template')}
              tooltip={t('admin:sms_template_id_for_binding_notification_methods_chinese')}
            >
              <Input
                isInvalid={Boolean(
                  form.getFieldState('loginProviders.sms.bindNotification.zh', form.formState).error
                )}
                {...register('loginProviders.sms.bindNotification.zh')}
                placeholder="SMS_xxx"
              />
            </AdminFormItem>
            <AdminFormItem
              label={t('admin:model_deprecation_chinese_template')}
              tooltip={t('admin:sms_template_id_for_model_deprecation_chinese')}
            >
              <Input
                isInvalid={Boolean(
                  form.getFieldState('loginProviders.sms.modelDeprecation.zh', form.formState).error
                )}
                {...register('loginProviders.sms.modelDeprecation.zh')}
                placeholder="SMS_xxx"
              />
            </AdminFormItem>
          </SimpleGrid>
        </AdminSettingSection>
      )}

      {/* 微信服务号 */}
      {showWechat && (
        <AdminSettingSection
          id="wechatLogin"
          title={t('admin:wechat_service_account_login')}
          showDivider
        >
          <SimpleGrid columns={[1, 2]} spacing={5}>
            <AdminFormItem
              label={t('admin:wechat_service_account_appid')}
              tooltip={t('admin:official_account_app_id')}
            >
              <Input
                isInvalid={Boolean(
                  form.getFieldState('loginProviders.wechat.appId', form.formState).error
                )}
                {...register('loginProviders.wechat.appId')}
                placeholder="wx******"
              />
            </AdminFormItem>
            <AdminFormItem
              label={t('admin:wechat_service_account_appsecret')}
              tooltip={t('admin:official_account_app_secret')}
            >
              <Controller
                name="loginProviders.wechat.appSecret"
                control={control}
                render={({ field }) => (
                  <AdminSecretInput
                    isInvalid={Boolean(form.getFieldState(field.name, form.formState).error)}
                    name={field.name}
                    value={field.value}
                    onChange={field.onChange}
                    isConfigured={auth.isSecretConfigured('loginProviders.wechat.appSecret')}
                  />
                )}
              />
            </AdminFormItem>
          </SimpleGrid>
        </AdminSettingSection>
      )}

      {/* 企业微信 */}
      {showWecom && (
        <AdminSettingSection id="wecomLogin" title={t('admin:wecom_login')} showDivider>
          <Text fontSize={'xs'} color={'myGray.500'} mb={3}>
            {t('admin:wecom_third_party_app_service_provider_integration_settings')}
          </Text>

          <SimpleGrid columns={[1, 2]} spacing={5}>
            <AdminFormItem label="SuiteId" tooltip={t('admin:wecom_service_provider_suiteid')}>
              <Input
                isInvalid={Boolean(
                  form.getFieldState('loginProviders.wecom.suiteId', form.formState).error
                )}
                {...register('loginProviders.wecom.suiteId')}
                placeholder="ww******"
              />
            </AdminFormItem>
            <AdminFormItem
              label="SuiteSecret"
              tooltip={t('admin:wecom_service_provider_app_secret')}
            >
              <Controller
                name="loginProviders.wecom.secret"
                control={control}
                render={({ field }) => (
                  <AdminSecretInput
                    isInvalid={Boolean(form.getFieldState(field.name, form.formState).error)}
                    name={field.name}
                    value={field.value}
                    onChange={field.onChange}
                    isConfigured={auth.isSecretConfigured('loginProviders.wecom.secret')}
                  />
                )}
              />
            </AdminFormItem>
            <AdminFormItem label="Token" tooltip={t('admin:callback_token')}>
              <Controller
                name="loginProviders.wecom.token"
                control={control}
                render={({ field }) => (
                  <AdminSecretInput
                    isInvalid={Boolean(form.getFieldState(field.name, form.formState).error)}
                    name={field.name}
                    value={field.value}
                    onChange={field.onChange}
                    isConfigured={auth.isSecretConfigured('loginProviders.wecom.token')}
                  />
                )}
              />
            </AdminFormItem>
            <AdminFormItem label="EncodingAESKey" tooltip={t('admin:callback_encryption_key')}>
              <Controller
                name="loginProviders.wecom.encodingAESKey"
                control={control}
                render={({ field }) => (
                  <AdminSecretInput
                    isInvalid={Boolean(form.getFieldState(field.name, form.formState).error)}
                    name={field.name}
                    value={field.value}
                    onChange={field.onChange}
                    isConfigured={auth.isSecretConfigured('loginProviders.wecom.encodingAESKey')}
                  />
                )}
              />
            </AdminFormItem>
            <AdminFormItem
              label={t('admin:enterprise_corpid')}
              tooltip={t('admin:wecom_enterprise_unique_identifier')}
            >
              <Input
                isInvalid={Boolean(
                  form.getFieldState('loginProviders.wecom.corpId', form.formState).error
                )}
                {...register('loginProviders.wecom.corpId')}
                placeholder="ww******"
              />
            </AdminFormItem>
            {showWecomProviderSecret && (
              <AdminFormItem
                label={t('admin:service_provider_secret')}
                tooltip={t('admin:service_provider_level_key')}
              >
                <Controller
                  name="loginProviders.wecom.providerSecret"
                  control={control}
                  render={({ field }) => (
                    <AdminSecretInput
                      isInvalid={Boolean(form.getFieldState(field.name, form.formState).error)}
                      name={field.name}
                      value={field.value}
                      onChange={field.onChange}
                      isConfigured={auth.isSecretConfigured('loginProviders.wecom.providerSecret')}
                    />
                  )}
                />
              </AdminFormItem>
            )}
            {showWecomSaaS && (
              <>
                <AdminFormItem label={t('admin:wecom_buyer_user_id')}>
                  <Input
                    isInvalid={Boolean(
                      form.getFieldState('loginProviders.wecom.buyerUserId', form.formState).error
                    )}
                    {...register('loginProviders.wecom.buyerUserId')}
                    placeholder="userid"
                  />
                </AdminFormItem>
                <AdminFormItem label={t('admin:wecom_basic_version_id')}>
                  <Input
                    isInvalid={Boolean(
                      form.getFieldState('loginProviders.wecom.basicVersionId', form.formState)
                        .error
                    )}
                    {...register('loginProviders.wecom.basicVersionId')}
                    placeholder="基础版版本ID"
                  />
                </AdminFormItem>
                <AdminFormItem label={t('admin:wecom_advanced_version_id')}>
                  <Input
                    isInvalid={Boolean(
                      form.getFieldState('loginProviders.wecom.advancedVersionId', form.formState)
                        .error
                    )}
                    {...register('loginProviders.wecom.advancedVersionId')}
                    placeholder="高级版版本ID"
                  />
                </AdminFormItem>
                <AdminFormItem label={t('admin:wecom_pay_secret')}>
                  <Controller
                    name="loginProviders.wecom.paySecret"
                    control={control}
                    render={({ field }) => (
                      <AdminSecretInput
                        isInvalid={Boolean(form.getFieldState(field.name, form.formState).error)}
                        name={field.name}
                        value={field.value}
                        onChange={field.onChange}
                        isConfigured={auth.isSecretConfigured('loginProviders.wecom.paySecret')}
                      />
                    )}
                  />
                </AdminFormItem>
              </>
            )}
          </SimpleGrid>
        </AdminSettingSection>
      )}

      {/* 各 OAuth 提供商独立成区，目录与权限判断保持对应。 */}
      {showGithub && (
        <AdminSettingSection id="githubLogin" title={t('admin:github_login')} showDivider>
          <SimpleGrid columns={[1, 2]} spacing={5}>
            <AdminFormItem label="GitHub Client ID" tooltip={t('admin:github_oauth_app_client_id')}>
              <Input
                isInvalid={Boolean(
                  form.getFieldState('loginProviders.github.clientId', form.formState).error
                )}
                {...register('loginProviders.github.clientId')}
                placeholder="******"
              />
            </AdminFormItem>
            <AdminFormItem
              label="GitHub Client Secret"
              tooltip={t('admin:github_oauth_app_client_secret')}
            >
              <Controller
                name="loginProviders.github.secret"
                control={control}
                render={({ field }) => (
                  <AdminSecretInput
                    isInvalid={Boolean(form.getFieldState(field.name, form.formState).error)}
                    name={field.name}
                    value={field.value}
                    onChange={field.onChange}
                    isConfigured={auth.isSecretConfigured('loginProviders.github.secret')}
                  />
                )}
              />
            </AdminFormItem>
          </SimpleGrid>
        </AdminSettingSection>
      )}
      {showGoogle && (
        <AdminSettingSection id="googleLogin" title={t('admin:google_login')} showDivider>
          <SimpleGrid columns={[1, 2]} spacing={5}>
            <AdminFormItem label="Google Client ID" tooltip={t('admin:google_oauth_2_0_client_id')}>
              <Input
                isInvalid={Boolean(
                  form.getFieldState('loginProviders.google.clientId', form.formState).error
                )}
                {...register('loginProviders.google.clientId')}
                placeholder="******"
              />
            </AdminFormItem>
            <AdminFormItem
              label="Google Client Secret"
              tooltip={t('admin:google_oauth_2_0_client_secret')}
            >
              <Controller
                name="loginProviders.google.secret"
                control={control}
                render={({ field }) => (
                  <AdminSecretInput
                    isInvalid={Boolean(form.getFieldState(field.name, form.formState).error)}
                    name={field.name}
                    value={field.value}
                    onChange={field.onChange}
                    isConfigured={auth.isSecretConfigured('loginProviders.google.secret')}
                  />
                )}
              />
            </AdminFormItem>
          </SimpleGrid>
        </AdminSettingSection>
      )}
      {showMicrosoft && (
        <AdminSettingSection id="microsoftLogin" title={t('admin:microsoft_login')} showDivider>
          <SimpleGrid columns={[1, 2]} spacing={5}>
            <AdminFormItem
              label="Microsoft Client ID"
              tooltip={t('admin:azure_ad_application_client_id')}
            >
              <Input
                isInvalid={Boolean(
                  form.getFieldState('loginProviders.microsoft.clientId', form.formState).error
                )}
                {...register('loginProviders.microsoft.clientId')}
                placeholder="******"
              />
            </AdminFormItem>
            <AdminFormItem
              label="Microsoft Client Secret"
              tooltip={t('admin:azure_ad_application_client_secret')}
            >
              <Controller
                name="loginProviders.microsoft.secret"
                control={control}
                render={({ field }) => (
                  <AdminSecretInput
                    isInvalid={Boolean(form.getFieldState(field.name, form.formState).error)}
                    name={field.name}
                    value={field.value}
                    onChange={field.onChange}
                    isConfigured={auth.isSecretConfigured('loginProviders.microsoft.secret')}
                  />
                )}
              />
            </AdminFormItem>
            <AdminFormItem
              label="Microsoft Tenant ID"
              tooltip={t('admin:azure_ad_tenant_id_use_common_for_multi_tenant')}
            >
              <Input
                isInvalid={Boolean(
                  form.getFieldState('loginProviders.microsoft.tenantId', form.formState).error
                )}
                {...register('loginProviders.microsoft.tenantId')}
                placeholder="common"
              />
            </AdminFormItem>
          </SimpleGrid>
        </AdminSettingSection>
      )}

      {/* 8. SSO 展示配置 */}
      {showSso && (
        <AdminSettingSection id="ssoLogin" title={t('admin:sso_settings')} showDivider>
          <SimpleGrid columns={[1, 2]} spacing={5}>
            <AdminFormItem label={t('admin:sso_login_button_title')}>
              <Input
                isInvalid={Boolean(form.getFieldState('sso.title', form.formState).error)}
                {...register('sso.title')}
                placeholder={t('admin:sso_login_button_title')}
              />
            </AdminFormItem>
            <AdminFormItem label={t('admin:sso_login_button_icon')}>
              <ImageInput control={control} name="sso.icon" />
            </AdminFormItem>
            <AdminSwitchRow
              name="sso.autoLogin"
              label={t('admin:sso_auto_login')}
              tooltip={t('admin:sso_auto_login_tip')}
              isChecked={ssoAutoLogin}
              onChange={(value) => setValue('sso.autoLogin', value, { shouldDirty: true })}
            />
            <AdminSwitchRow
              name="sso.disablePasswordForSsoUsers"
              label={t('admin:disable_password_for_sso_users')}
              tooltip={t('admin:disable_password_for_sso_users_tip')}
              isChecked={ssoDisablePassword}
              onChange={(value) =>
                setValue('sso.disablePasswordForSsoUsers', value, { shouldDirty: true })
              }
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
                  isInvalid={Boolean(form.getFieldState('fastLogin', form.formState).error)}
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
    </AdminSettingPage>
  );
};

export default React.memo(AuthSettingComponent);
