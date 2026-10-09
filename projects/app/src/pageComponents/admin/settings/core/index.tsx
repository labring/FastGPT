import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import React, { useEffect, useMemo } from 'react';
import {
  SimpleGrid,
  Input,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper
} from '@chakra-ui/react';
import { useForm, Controller, useWatch } from 'react-hook-form';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useDomainConfig, batchUpdateDomainConfigApi } from '@/web/common/system/useDomainConfig';
import { useAdminPermission } from '@/pageComponents/admin/useAdminPermission';
import AdminSettingPage from '@/pageComponents/admin/settings/AdminSettingPage';
import AdminSettingSection from '@/pageComponents/admin/settings/AdminSettingSection';
import AdminFormItem from '@/pageComponents/admin/settings/AdminFormItem';
import AdminSwitchRow from '@/pageComponents/admin/settings/AdminSwitchRow';
import type { SettingTOCItem } from '@/pageComponents/admin/settings/AdminSettingTOC';
import type { SystemInstanceConfigDomainMap } from '@fastgpt/global/common/system/config/type';

type CoreConfigForm = {
  teamMode: SystemInstanceConfigDomainMap['auth']['teamMode'];
  defaultTeamBasicPermissionsEnabled: SystemInstanceConfigDomainMap['auth']['defaultTeamBasicPermissionsEnabled'];
  agentEngine: SystemInstanceConfigDomainMap['feature']['agentEngine'];
  multipleDataToBase64: SystemInstanceConfigDomainMap['feature']['multipleDataToBase64'];
  downloadMode: SystemInstanceConfigDomainMap['storage']['downloadMode'];
  externalEndpoint: SystemInstanceConfigDomainMap['storage']['externalEndpoint'];
  cdnEndpoint: SystemInstanceConfigDomainMap['storage']['cdnEndpoint'];
  openApiPrefix: SystemInstanceConfigDomainMap['site']['openApiPrefix'];
  email: SystemInstanceConfigDomainMap['auth']['loginProviders']['email'];
  phone: SystemInstanceConfigDomainMap['auth']['loginProviders']['phone'];
};

/** 数字输入统一尺寸：两列布局下不撑满单元格，避免与文本输入宽度不一致 */
const numberInputProps = { variant: 'whiteOutline' as const, maxW: '400px' };

/**
 * 核心配置页：影响面最大的少量运行策略集中在一处，避免分散在多个配置页。
 * 字段跨越 auth / feature / storage / site 四个配置域，保存时逐域携带各自 revision 局部提交。
 */
const CoreSettingComponent = () => {
  const { t } = useClientTranslation('admin');
  const tocItems: SettingTOCItem[] = useMemo(
    () => [
      { id: 'team', label: t('admin:core_section_team') },
      { id: 'engine', label: t('admin:core_section_engine') },
      { id: 'applicationRuntime', label: t('admin:application_runtime') },
      { id: 'download', label: t('admin:core_section_download') },
      { id: 'openapi', label: t('admin:core_section_openapi') },
      { id: 'email', label: t('admin:email_notification_config') },
      { id: 'sms', label: t('admin:aliyun_sms_credentials') }
    ],
    [t]
  );

  const auth = useDomainConfig('auth');
  const feature = useDomainConfig('feature');
  const storage = useDomainConfig('storage');
  const site = useDomainConfig('site');
  const { isFieldVisible } = useAdminPermission();

  // 团队模式为商业版能力，社区版不展示
  const showTeamMode = isFieldVisible('auth.teamMode');

  const isLoading = auth.isLoading || feature.isLoading || storage.isLoading || site.isLoading;

  const { control, handleSubmit, reset, register } = useForm<CoreConfigForm>({
    defaultValues: {
      teamMode: 'single',
      defaultTeamBasicPermissionsEnabled: false,
      agentEngine: 'fastAgent',
      multipleDataToBase64: false,
      downloadMode: 'short-proxy',
      externalEndpoint: '',
      cdnEndpoint: '',
      openApiPrefix: 'fastgpt',
      email: {
        smtp: '',
        user: '',
        pass: '',
        port: 465,
        secure: true,
        register: false
      },
      phone: { accessKeyId: '', accessKeySecret: '', signName: '' }
    }
  });

  const downloadMode = useWatch({ control, name: 'downloadMode' });

  useEffect(() => {
    if (isLoading) return;
    reset({
      teamMode: auth.effectiveConfig?.teamMode ?? 'single',
      defaultTeamBasicPermissionsEnabled:
        auth.effectiveConfig?.defaultTeamBasicPermissionsEnabled ?? false,
      agentEngine: feature.effectiveConfig?.agentEngine ?? 'fastAgent',
      multipleDataToBase64: feature.effectiveConfig?.multipleDataToBase64 ?? false,
      downloadMode: storage.effectiveConfig?.downloadMode ?? 'short-proxy',
      externalEndpoint: storage.effectiveConfig?.externalEndpoint ?? '',
      cdnEndpoint: storage.effectiveConfig?.cdnEndpoint ?? '',
      openApiPrefix: site.effectiveConfig?.openApiPrefix ?? 'fastgpt',
      email: auth.effectiveConfig?.loginProviders?.email ?? {
        smtp: '',
        user: '',
        pass: '',
        port: 465,
        secure: true,
        register: false
      },
      phone: auth.effectiveConfig?.loginProviders?.phone ?? {
        accessKeyId: '',
        accessKeySecret: '',
        signName: ''
      }
    });
  }, [
    auth.effectiveConfig,
    feature.effectiveConfig,
    storage.effectiveConfig,
    site.effectiveConfig,
    isLoading,
    reset
  ]);

  const { runAsync: onSave, loading: isSaving } = useRequest(
    async (formData: CoreConfigForm) => {
      // 跨域原子提交：auth、feature、storage、site 四个域合并为单个事务请求，避免多域分步提交留下半写
      await batchUpdateDomainConfigApi({
        items: [
          {
            domain: 'auth',
            expectedRevision: auth.revision,
            overrides: {
              ...(auth.overrides as Record<string, unknown>),
              defaultTeamBasicPermissionsEnabled: formData.defaultTeamBasicPermissionsEnabled,
              ...(showTeamMode ? { teamMode: formData.teamMode } : {}),
              loginProviders: {
                ...((auth.effectiveConfig?.loginProviders ?? {}) as Record<string, unknown>),
                email: formData.email,
                phone: formData.phone
              }
            }
          },
          {
            domain: 'feature',
            expectedRevision: feature.revision,
            overrides: {
              ...(feature.overrides as Record<string, unknown>),
              agentEngine: formData.agentEngine,
              multipleDataToBase64: formData.multipleDataToBase64
            }
          },
          {
            domain: 'storage',
            expectedRevision: storage.revision,
            overrides: {
              ...(storage.overrides as Record<string, unknown>),
              downloadMode: formData.downloadMode,
              externalEndpoint: formData.externalEndpoint || '',
              cdnEndpoint: formData.cdnEndpoint || ''
            }
          },
          {
            domain: 'site',
            expectedRevision: site.revision,
            overrides: {
              ...(site.overrides as Record<string, unknown>),
              openApiPrefix: formData.openApiPrefix
            }
          }
        ]
      });
    },
    {
      successToast: 'admin:settings_saved',
      errorToast: 'admin:failed_to_save_settings',
      onSuccess: () => {
        void auth.refetch();
        void feature.refetch();
        void storage.refetch();
        void site.refetch();
      }
    }
  );

  const submit = useMemo(() => handleSubmit((data) => onSave(data)), [handleSubmit, onSave]);

  return (
    <AdminSettingPage
      headerTitle={t('admin:page_title_core')}
      tocItems={tocItems}
      isLoading={isLoading}
      isSaving={isSaving}
      onSave={submit}
    >
      {/* 1. 团队 */}
      <AdminSettingSection id="team" title={t('admin:core_section_team')}>
        <SimpleGrid columns={[1, 2]} spacingX={16} spacingY={4}>
          <Controller
            name="defaultTeamBasicPermissionsEnabled"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label={t('admin:enable_basic_permissions_for_new_teams_by_default')}
                tooltip={t('admin:enable_the_basic_member_permission_template_by_default_for_n')}
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </SimpleGrid>

        {showTeamMode && (
          <AdminFormItem
            label={t('admin:team_mode')}
            tooltip={t('admin:multi_multiple_teams_single_single_team_sync_account_sync_sy')}
            mb={0}
          >
            <Controller
              name="teamMode"
              control={control}
              render={({ field }) => (
                <MySelect<SystemInstanceConfigDomainMap['auth']['teamMode']>
                  width={'400px'}
                  /* sync 需配合外部用户系统（SSO 配置在 pro 侧），不提供主动切换入口；
                     但库内已是 sync 时必须回显该选项，否则展示空白且保存会误覆盖破坏同步登录 */
                  list={
                    field.value === 'sync'
                      ? [
                          { label: t('admin:single_single_team'), value: 'single' },
                          { label: t('admin:multi_multiple_teams'), value: 'multi' },
                          { label: t('admin:sync_account_sync'), value: 'sync' }
                        ]
                      : [
                          { label: t('admin:single_single_team'), value: 'single' },
                          { label: t('admin:multi_multiple_teams'), value: 'multi' }
                        ]
                  }
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </AdminFormItem>
        )}
      </AdminSettingSection>

      {/* 2. 执行引擎 */}
      <AdminSettingSection id="engine" title={t('admin:core_section_engine')} showDivider>
        <AdminFormItem
          label={t('admin:agent_execution_engine')}
          tooltip={t('admin:fastagent_lightweight_high_concurrency_single_node_engine_pi')}
          isRequired
          mb={0}
        >
          <Controller
            name="agentEngine"
            control={control}
            render={({ field }) => (
              <MySelect<string>
                width={'400px'}
                list={[
                  {
                    label: t('admin:fastagent_high_performance_single_node_streaming_engine'),
                    value: 'fastAgent'
                  },
                  {
                    label: t('admin:piagent_multi_step_reasoning_and_tool_planning_engine'),
                    value: 'piAgent'
                  }
                ]}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </AdminFormItem>
      </AdminSettingSection>

      {/* 3. 应用运行 */}
      <AdminSettingSection
        id="applicationRuntime"
        title={t('admin:application_runtime')}
        showDivider
      >
        <SimpleGrid columns={[1, 2]} spacingX={16} spacingY={4}>
          <Controller
            name="multipleDataToBase64"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label={t('admin:convert_multimodal_content_to_base64_for_models')}
                tooltip={t('admin:when_enabled_rich_media_such_as_images_is_converted_to_base6')}
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </SimpleGrid>
      </AdminSettingSection>

      {/* 4. 下载链接 */}
      <AdminSettingSection id="download" title={t('admin:core_section_download')} showDivider>
        <AdminFormItem
          label={t('admin:download_link_mode')}
          tooltip={t('admin:short_proxy_streamed_proxy_download_via_the_main_site_hides')}
          isRequired
          mb={downloadMode === 'short-redirect' ? 4 : 0}
        >
          <Controller
            name="downloadMode"
            control={control}
            render={({ field }) => (
              <MySelect<'short-proxy' | 'short-redirect'>
                width={'400px'}
                list={[
                  {
                    label: t('admin:short_proxy_proxy_download_via_main_site'),
                    value: 'short-proxy'
                  },
                  { label: t('admin:short_redirect_s3_signed_redirect'), value: 'short-redirect' }
                ]}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </AdminFormItem>

        {downloadMode === 'short-redirect' && (
          <SimpleGrid columns={[1, 2]} spacing={5} mt={4}>
            <AdminFormItem
              label={t('admin:storage_external_endpoint')}
              tooltip={t('admin:storage_external_endpoint_tip')}
              mb={0}
            >
              <Input {...register('externalEndpoint')} placeholder="https://files.example.com" />
            </AdminFormItem>
            <AdminFormItem
              label={t('admin:storage_cdn_endpoint')}
              tooltip={t('admin:storage_cdn_endpoint_tip')}
              mb={0}
            >
              <Input {...register('cdnEndpoint')} placeholder="https://cdn.example.com" />
            </AdminFormItem>
          </SimpleGrid>
        )}
      </AdminSettingSection>

      {/* 5. 开放接口 */}
      <AdminSettingSection id="openapi" title={t('admin:core_section_openapi')} showDivider>
        <AdminFormItem
          label={t('admin:openapi_key_prefix')}
          tooltip={t('admin:unified_prefix_for_generated_openapi_keys_default_fastgpt_ch')}
          isRequired
          mb={0}
        >
          <Input width={'400px'} {...register('openApiPrefix')} placeholder="fastgpt" />
        </AdminFormItem>
      </AdminSettingSection>

      {/* 6. 邮箱通知 (SMTP) */}
      <AdminSettingSection id="email" title={t('admin:email_notification_config')} showDivider>
        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem
            label={t('admin:smtp_server_address')}
            tooltip={t('admin:mail_server_address_e_g_smtp_example_com')}
          >
            <Input {...register('email.smtp')} placeholder="smtp.example.com" />
          </AdminFormItem>
          <AdminFormItem
            label={t('admin:sender_email_account')}
            tooltip={t('admin:account_used_to_send_system_notification_emails')}
          >
            <Input {...register('email.user')} placeholder="no-reply@example.com" />
          </AdminFormItem>
          <AdminFormItem
            label={t('admin:email_auth_code_password')}
            tooltip={t('admin:smtp_login_credentials')}
          >
            <Input type="password" {...register('email.pass')} placeholder="******" />
          </AdminFormItem>
          <AdminFormItem
            label={t('admin:smtp_port')}
            tooltip={t('admin:common_ports_465_ssl_587_tls')}
          >
            <Controller
              name="email.port"
              control={control}
              render={({ field }) => (
                <NumberInput
                  {...numberInputProps}
                  min={1}
                  max={65535}
                  value={field.value ?? 465}
                  onChange={(_, val) => field.onChange(val || 465)}
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

        <SimpleGrid columns={[1, 2]} spacingX={16} spacingY={4} mt={4}>
          <Controller
            name="email.secure"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label={t('admin:enable_ssl')}
                tooltip={t('admin:port_465_is_usually_enabled_port_587_recommends_starttls')}
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />
          <Controller
            name="email.register"
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
      </AdminSettingSection>

      {/* 7. 阿里云短信密钥配置 */}
      <AdminSettingSection id="sms" title={t('admin:aliyun_sms_credentials')} showDivider>
        <SimpleGrid columns={[1, 3]} spacing={5}>
          <AdminFormItem
            label={t('admin:aliyun_accesskeyid')}
            tooltip={t('admin:sms_accesskey_id')}
          >
            <Input {...register('phone.accessKeyId')} placeholder="******" />
          </AdminFormItem>
          <AdminFormItem
            label={t('admin:aliyun_accesskeysecret')}
            tooltip={t('admin:sms_accesskey_secret')}
          >
            <Input type="password" {...register('phone.accessKeySecret')} placeholder="******" />
          </AdminFormItem>
          <AdminFormItem
            label={t('admin:sms_signature')}
            tooltip={t('admin:signature_name_approved_in_the_aliyun_sms_console')}
          >
            <Input {...register('phone.signName')} placeholder="FastGPT" />
          </AdminFormItem>
        </SimpleGrid>
      </AdminSettingSection>
    </AdminSettingPage>
  );
};

export default React.memo(CoreSettingComponent);
