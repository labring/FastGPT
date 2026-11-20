import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import React, { useEffect, useMemo } from 'react';
import {
  SimpleGrid,
  Box,
  HStack,
  Input,
  Switch,
  Text,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper
} from '@chakra-ui/react';
import { useForm, Controller, useWatch } from 'react-hook-form';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useAdminConfigSaveRequest } from '@/web/common/system/useAdminConfigSaveRequest';
import { useDomainConfig, updateDomainConfigApi } from '@/web/common/system/useDomainConfig';
import { useAdminPermission } from '@/pageComponents/admin/useAdminPermission';
import AdminSettingPage from '@/pageComponents/admin/settings/AdminSettingPage';
import AdminSettingSection from '@/pageComponents/admin/settings/AdminSettingSection';
import AdminFormItem from '@/pageComponents/admin/settings/AdminFormItem';
import AdminSecretInput from '@/pageComponents/admin/settings/AdminSecretInput';
import AdminNumberInput from '@/pageComponents/admin/settings/AdminNumberInput';
import ConnectivityTestInput from '@/pageComponents/admin/settings/ConnectivityTestInput';
import ConnectivityTestGroup from '@/pageComponents/admin/settings/ConnectivityTestGroup';
import AdminSwitchRow from '@/pageComponents/admin/settings/AdminSwitchRow';
import { isValidHttpUrl, isValidServiceBaseUrl } from '@fastgpt/global/common/string/url';
import { deepMergeConfig } from '@fastgpt/global/common/system/config/merge';
import type { SettingTOCItem } from '@/pageComponents/admin/settings/AdminSettingTOC';
import type { SystemInstanceConfigDomainMap } from '@fastgpt/global/common/system/config/schema';
import { SitePublicUrlSchema } from '@fastgpt/global/common/system/config/schemas/site';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { DeepPartial } from '@fastgpt/global/common/system/config/type';

type CoreConfigForm = {
  publicUrl: SystemInstanceConfigDomainMap['site']['publicUrl'];
  documentParse: SystemInstanceConfigDomainMap['providers']['documentParse'];
  agentEngine: SystemInstanceConfigDomainMap['feature']['agentEngine'];
  multipleDataToBase64: SystemInstanceConfigDomainMap['feature']['multipleDataToBase64'];
  fileDomain: SystemInstanceConfigDomainMap['storage']['fileDomain'];
  downloadMode: SystemInstanceConfigDomainMap['storage']['downloadMode'];
  externalEndpoint: SystemInstanceConfigDomainMap['storage']['externalEndpoint'];
  cdnEndpoint: SystemInstanceConfigDomainMap['storage']['cdnEndpoint'];
  email: Omit<SystemInstanceConfigDomainMap['auth']['loginProviders']['email'], 'register'>;
  phone: SystemInstanceConfigDomainMap['auth']['loginProviders']['phone'];
};

/** 数字输入统一尺寸：两列布局下不撑满单元格，避免与文本输入宽度不一致 */
const numberInputProps = { variant: 'whiteOutline' as const, maxW: '400px' };

/**
 * 核心配置页：影响面最大的少量运行策略集中在一处，避免分散在多个配置页。
 * 字段跨越 site / auth / feature / storage / providers 五个配置域，保存时逐域携带各自 revision 局部提交。
 */
const CoreSettingComponent = () => {
  const { t } = useSafeTranslation();
  const { isPro, isFieldVisible, filterConfigData, filterConfigDataByEdition } =
    useAdminPermission();
  const { subPlans } = useSystemStore();
  const showEmail = isFieldVisible('auth.loginProviders.email.smtp');
  const showPhone = isFieldVisible('auth.loginProviders.phone.signName');

  const tocItems: SettingTOCItem[] = useMemo(
    () => [
      { id: 'basic', label: t('admin:core_section_basic') },
      { id: 'download', label: t('admin:core_section_download') },
      { id: 'documentParse', label: t('admin:provider_section_doc_parse') },
      ...(showEmail ? [{ id: 'email', label: t('admin:email_notification_config') }] : []),
      ...(showPhone ? [{ id: 'sms', label: t('admin:aliyun_sms_credentials') }] : [])
    ],
    [t, showEmail, showPhone]
  );

  const site = useDomainConfig('site');
  const auth = useDomainConfig('auth');
  const feature = useDomainConfig('feature');
  const storage = useDomainConfig('storage');
  const providers = useDomainConfig('providers');
  const isSecretConfigured = providers.isSecretConfigured;

  const isLoading =
    site.isLoading ||
    auth.isLoading ||
    feature.isLoading ||
    storage.isLoading ||
    providers.isLoading;

  const form = useForm<CoreConfigForm>({
    defaultValues: {
      publicUrl: '',
      documentParse: providers.effectiveConfig.documentParse,
      agentEngine: 'fastAgent',
      multipleDataToBase64: false,
      fileDomain: '',
      downloadMode: 'short-proxy',
      externalEndpoint: '',
      cdnEndpoint: '',
      email: {
        smtp: '',
        user: '',
        port: 465,
        secure: true
      },
      phone: { accessKeyId: '', signName: '' }
    }
  });
  const {
    control,
    handleSubmit,
    reset,
    register,
    formState: { errors }
  } = form;

  const documentParseProvider = useWatch({ control, name: 'documentParse.provider' });
  const downloadMode = useWatch({ control, name: 'downloadMode' });
  // 与订阅套餐开关一致：无套餐或空套餐均不展示计费，开源版始终隐藏。
  const showPdfPrice =
    isPro &&
    Boolean(subPlans?.standard && Object.keys(subPlans.standard).length > 0) &&
    Boolean(documentParseProvider) &&
    documentParseProvider !== 'none';

  useEffect(() => {
    if (isLoading) return;
    reset({
      // 仅为空配置提供浏览器草稿，保存前不发布到 scope，不覆盖已有公网地址。
      publicUrl: site.effectiveConfig?.publicUrl || window.location.origin,
      documentParse: providers.effectiveConfig.documentParse,
      agentEngine: feature.effectiveConfig?.agentEngine ?? 'fastAgent',
      multipleDataToBase64: feature.effectiveConfig?.multipleDataToBase64 ?? false,
      fileDomain: storage.effectiveConfig?.fileDomain ?? '',
      downloadMode: storage.effectiveConfig?.downloadMode ?? 'short-proxy',
      externalEndpoint: storage.effectiveConfig?.externalEndpoint ?? '',
      cdnEndpoint: storage.effectiveConfig?.cdnEndpoint ?? '',
      email: {
        smtp: auth.effectiveConfig?.loginProviders?.email.smtp ?? '',
        user: auth.effectiveConfig?.loginProviders?.email.user ?? '',
        port: auth.effectiveConfig?.loginProviders?.email.port ?? 465,
        secure: auth.effectiveConfig?.loginProviders?.email.secure ?? true
      },
      phone: auth.effectiveConfig?.loginProviders?.phone ?? {
        accessKeyId: '',
        signName: ''
      }
    });
  }, [
    site.effectiveConfig,
    auth.effectiveConfig,
    feature.effectiveConfig,
    storage.effectiveConfig,
    providers.effectiveConfig,
    isLoading,
    reset
  ]);

  const { runAsync: onSave, loading: isSaving } = useAdminConfigSaveRequest(
    async (formData: CoreConfigForm) => {
      const activeProvider = formData.documentParse.provider;
      const isCustomActive = activeProvider === 'customPdf' || activeProvider === 'custom';
      const isSangforActive = activeProvider === 'sangfor';
      const rawPrice = Number(formData.documentParse.customPdf.price);
      const isValidOptionalUrl = (url?: string) => !url || isValidHttpUrl(url);
      // 隐藏 Provider 的半成品地址回退到已存值；密钥仍按省略、替换和清空语义提交。
      // 隐藏时省略价格补丁，由服务端保留当前值，避免提交表单中的默认值或过期草稿。
      const { price: _price, ...customPdf } = formData.documentParse.customPdf;
      const documentParse: DeepPartial<CoreConfigForm['documentParse']> = {
        ...formData.documentParse,
        customPdf: {
          ...customPdf,
          ...(showPdfPrice
            ? { price: Number.isFinite(rawPrice) && rawPrice >= 0 ? rawPrice : 0 }
            : {}),
          url:
            isCustomActive || isValidOptionalUrl(formData.documentParse.customPdf.url)
              ? formData.documentParse.customPdf.url
              : (providers.effectiveConfig.documentParse?.customPdf?.url ?? '')
        },
        sangfor: {
          ...formData.documentParse.sangfor,
          url:
            isSangforActive || isValidOptionalUrl(formData.documentParse.sangfor.url)
              ? formData.documentParse.sangfor.url
              : (providers.effectiveConfig.documentParse?.sangfor?.url ?? '')
        }
      };
      // 排除历史团队模式字段：部署 ENV 是唯一权威，页面不能将旧值重新提交。
      const { teamMode: _preservedTeamMode, ...preservedAuthOverrides } = filterConfigDataByEdition(
        'auth',
        auth.overrides
      ) as Record<string, unknown>;

      // 跨域原子提交：site、auth、feature、storage、providers 五个域合并为单个事务请求，避免多域分步提交留下半写
      await updateDomainConfigApi({
        items: [
          {
            domain: 'site',
            expectedRevision: site.revision,
            overrides: { publicUrl: formData.publicUrl }
          },
          {
            domain: 'providers',
            expectedRevision: providers.revision,
            overrides: filterConfigData('providers', { documentParse }) as Record<string, unknown>
          },
          {
            domain: 'auth',
            expectedRevision: auth.revision,
            overrides: deepMergeConfig(
              preservedAuthOverrides,
              filterConfigData('auth', {
                loginProviders: {
                  // 核心页只保存 SMTP 字段，邮箱注册由账号与登录页维护。
                  email: {
                    smtp: formData.email.smtp,
                    user: formData.email.user,
                    pass: formData.email.pass,
                    port: formData.email.port,
                    secure: formData.email.secure
                  },
                  phone: formData.phone
                }
              })
            )
          },
          {
            domain: 'feature',
            expectedRevision: feature.revision,
            overrides: deepMergeConfig(
              filterConfigDataByEdition('feature', feature.overrides) as Record<string, unknown>,
              filterConfigData('feature', {
                agentEngine: formData.agentEngine,
                multipleDataToBase64: formData.multipleDataToBase64
              })
            )
          },
          {
            domain: 'storage',
            expectedRevision: storage.revision,
            overrides: deepMergeConfig(
              filterConfigDataByEdition('storage', storage.overrides) as Record<string, unknown>,
              filterConfigData('storage', {
                fileDomain: formData.fileDomain,
                downloadMode: formData.downloadMode,
                externalEndpoint: formData.externalEndpoint || '',
                cdnEndpoint: formData.cdnEndpoint || ''
              })
            )
          }
        ]
      });
      await Promise.all([
        site.refetch(),
        auth.refetch(),
        feature.refetch(),
        storage.refetch(),
        providers.refetch()
      ]);
    },
    {
      successToast: 'admin:settings_saved',
      errorToast: 'admin:failed_to_save_settings'
    }
  );

  const submit = useMemo(() => handleSubmit((data) => onSave(data)), [handleSubmit, onSave]);

  return (
    <AdminSettingPage
      form={form}
      fieldAliases={{ 'auth.loginProviders.email': 'email', 'auth.loginProviders.phone': 'phone' }}
      headerTitle={t('admin:page_title_core')}
      tocItems={tocItems}
      isLoading={isLoading}
      isSaving={isSaving}
      onSave={submit}
    >
      {/* 1. 基础配置 */}
      <AdminSettingSection id="basic" title={t('admin:core_section_basic')}>
        <AdminFormItem
          label={t('admin:main_site_domain')}
          tooltip={t('admin:main_site_domain_tip')}
          isRequired
        >
          <Input
            {...register('publicUrl', {
              required: t('admin:required'),
              validate: (value) =>
                SitePublicUrlSchema.safeParse(value).success ||
                t('admin:invalid_subservice_base_url')
            })}
            isInvalid={Boolean(errors.publicUrl)}
            placeholder="https://cloud.fastgpt.cn"
          />
          {errors.publicUrl && (
            <Text color={'red.500'} fontSize={'xs'} mt={1}>
              {errors.publicUrl.message}
            </Text>
          )}
        </AdminFormItem>
        <SimpleGrid columns={[1, 2]} spacingX={16} spacingY={4} alignItems={'start'}>
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
                  isInvalid={Boolean(form.getFieldState(field.name, form.formState).error)}
                  width={'100%'}
                  maxW={'400px'}
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
          <AdminFormItem
            label={t('admin:convert_multimodal_content_to_base64_for_models')}
            tooltip={t('admin:when_enabled_rich_media_such_as_images_is_converted_to_base6')}
            mb={0}
          >
            <Box minH={9} display={'flex'} alignItems={'center'}>
              <Controller
                name="multipleDataToBase64"
                control={control}
                render={({ field }) => (
                  <Switch
                    aria-label={t('admin:convert_multimodal_content_to_base64_for_models')}
                    isChecked={field.value}
                    onChange={(event) => field.onChange(event.target.checked)}
                    colorScheme={'blue'}
                  />
                )}
              />
            </Box>
          </AdminFormItem>
        </SimpleGrid>
      </AdminSettingSection>

      {/* 2. 文件系统 */}
      <AdminSettingSection id="download" title={t('admin:core_section_download')} showDivider>
        <AdminFormItem
          label={t('admin:file_service_domain')}
          tooltip={t('admin:file_service_domain_tip')}
          mb={4}
        >
          <Controller
            name="fileDomain"
            control={control}
            rules={{
              validate: (value) =>
                !value || isValidServiceBaseUrl(value) || t('admin:invalid_subservice_base_url')
            }}
            render={({ field }) => (
              <ConnectivityTestInput
                {...field}
                isEditable
                service="fileService"
                isInvalid={Boolean(errors.fileDomain)}
                placeholder="https://files.example.com"
              />
            )}
          />
          {errors.fileDomain && (
            <Text color={'red.500'} fontSize={'xs'} mt={1}>
              {errors.fileDomain.message}
            </Text>
          )}
        </AdminFormItem>
        <AdminFormItem
          label={t('admin:download_link_mode')}
          tooltip={t('admin:short_proxy_streamed_proxy_download_via_the_main_site_hides')}
          isRequired
          mb={4}
        >
          <Controller
            name="downloadMode"
            control={control}
            render={({ field }) => (
              <MySelect<'short-proxy' | 'short-redirect'>
                isInvalid={Boolean(form.getFieldState(field.name, form.formState).error)}
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
              <Input
                isInvalid={Boolean(form.getFieldState('externalEndpoint', form.formState).error)}
                {...register('externalEndpoint')}
                placeholder="https://storage.example.com"
              />
            </AdminFormItem>
            <AdminFormItem
              label={t('admin:storage_cdn_endpoint')}
              tooltip={t('admin:storage_cdn_endpoint_tip')}
              mb={0}
            >
              <Controller
                name="cdnEndpoint"
                control={control}
                render={({ field }) => (
                  <ConnectivityTestInput
                    isInvalid={Boolean(form.getFieldState(field.name, form.formState).error)}
                    {...field}
                    isEditable
                    service="cdn"
                    placeholder="https://cdn.example.com"
                  />
                )}
              />
            </AdminFormItem>
          </SimpleGrid>
        )}
      </AdminSettingSection>

      {/* 文档增强解析 */}
      <AdminSettingSection
        id="documentParse"
        title={t('admin:provider_section_doc_parse')}
        showDivider
      >
        <SimpleGrid columns={[1, 2]} spacing={5} alignItems={'start'} mb={6}>
          <AdminFormItem
            label={t('admin:parsing_provider')}
            tooltip={t('admin:select_the_provider_used_to_parse_hard_formats_such_as_scann')}
            isRequired
            mb={0}
          >
            <Controller
              name="documentParse.provider"
              control={control}
              render={({ field }) => (
                <MySelect
                  isInvalid={Boolean(form.getFieldState(field.name, form.formState).error)}
                  width={'full'}
                  maxW={'400px'}
                  placeholder={t('admin:select_a_parsing_provider')}
                  list={[
                    { label: t('admin:none'), value: 'none' },
                    { label: 'somark', value: 'somark' },
                    { label: 'doc2x', value: 'doc2x' },
                    { label: 'textln', value: 'textln' },
                    { label: t('admin:custom_self_hosted'), value: 'customPdf' },
                    { label: t('admin:sangfor_short'), value: 'sangfor' }
                  ]}
                  value={
                    field.value === 'textin'
                      ? 'textln'
                      : field.value === 'custom'
                        ? 'customPdf'
                        : field.value
                  }
                  onChange={field.onChange}
                />
              )}
            />
          </AdminFormItem>

          {/* 后端对全部启用的 PDF Provider 统一按 customPdf.price 计费，不能只在 customPdf 下展示 */}
          {showPdfPrice && (
            <AdminFormItem label={t('admin:custom_pdf_parse_price')} mb={0}>
              <HStack spacing={3}>
                <Controller
                  name="documentParse.customPdf.price"
                  control={control}
                  render={({ field }) => (
                    <AdminNumberInput
                      isInvalid={Boolean(form.getFieldState(field.name, form.formState).error)}
                      name={field.name}
                      flex={1}
                      minW={0}
                      maxW={'400px'}
                      min={0}
                      step={0.1}
                      value={field.value}
                      fallbackValue={0}
                      onChange={field.onChange}
                    />
                  )}
                />
                <Text flexShrink={0} whiteSpace={'nowrap'} fontSize={'sm'} color={'myGray.600'}>
                  {t('admin:pdf_points_per_page')}
                </Text>
              </HStack>
            </AdminFormItem>
          )}
        </SimpleGrid>

        {documentParseProvider === 'somark' && (
          <Box
            p={5}
            bg={'white'}
            borderRadius={'lg'}
            borderWidth={'1px'}
            borderColor={'myGray.200'}
            mb={6}
          >
            <AdminFormItem
              label="Somark API Key"
              tooltip={t('admin:use_the_official_somark_intelligent_cloud_parsing_credential')}
              isRequired
              mb={0}
            >
              <Controller
                name="documentParse.customPdf.somarkApiKey"
                control={control}
                render={({ field }) => (
                  <AdminSecretInput
                    isInvalid={Boolean(form.getFieldState(field.name, form.formState).error)}
                    name={field.name}
                    value={field.value}
                    onChange={field.onChange}
                    isConfigured={isSecretConfigured('documentParse.customPdf.somarkApiKey')}
                  />
                )}
              />
            </AdminFormItem>
          </Box>
        )}

        {documentParseProvider === 'doc2x' && (
          <Box
            p={5}
            bg={'white'}
            borderRadius={'lg'}
            borderWidth={'1px'}
            borderColor={'myGray.200'}
            mb={6}
          >
            <AdminFormItem
              label="Doc2X Key"
              tooltip={t('admin:use_the_official_doc2x_layout_recognition_and_table_extracti')}
              isRequired
              mb={0}
            >
              <Controller
                name="documentParse.customPdf.doc2xKey"
                control={control}
                render={({ field }) => (
                  <AdminSecretInput
                    isInvalid={Boolean(form.getFieldState(field.name, form.formState).error)}
                    name={field.name}
                    value={field.value}
                    onChange={field.onChange}
                    isConfigured={isSecretConfigured('documentParse.customPdf.doc2xKey')}
                  />
                )}
              />
            </AdminFormItem>
          </Box>
        )}

        {(documentParseProvider === 'textln' || documentParseProvider === 'textin') && (
          <Box
            p={5}
            bg={'white'}
            borderRadius={'lg'}
            borderWidth={'1px'}
            borderColor={'myGray.200'}
            mb={6}
          >
            <SimpleGrid columns={[1, 2]} spacing={5}>
              <AdminFormItem
                label="TextIn AppId"
                tooltip={t('admin:intsig_textin_platform_appid')}
                isRequired
              >
                <Controller
                  name="documentParse.customPdf.textinAppId"
                  control={control}
                  render={({ field }) => (
                    <AdminSecretInput
                      isInvalid={Boolean(form.getFieldState(field.name, form.formState).error)}
                      name={field.name}
                      value={field.value}
                      onChange={field.onChange}
                      isConfigured={isSecretConfigured('documentParse.customPdf.textinAppId')}
                    />
                  )}
                />
              </AdminFormItem>

              <AdminFormItem
                label="TextIn Secret Code"
                tooltip={t('admin:intsig_textin_platform_secret_code')}
                isRequired
              >
                <Controller
                  name="documentParse.customPdf.textinSecretCode"
                  control={control}
                  render={({ field }) => (
                    <AdminSecretInput
                      isInvalid={Boolean(form.getFieldState(field.name, form.formState).error)}
                      name={field.name}
                      value={field.value}
                      onChange={field.onChange}
                      isConfigured={isSecretConfigured('documentParse.customPdf.textinSecretCode')}
                    />
                  )}
                />
              </AdminFormItem>
            </SimpleGrid>
          </Box>
        )}

        {(documentParseProvider === 'customPdf' || documentParseProvider === 'custom') && (
          <Box
            p={5}
            bg={'white'}
            borderRadius={'lg'}
            borderWidth={'1px'}
            borderColor={'myGray.200'}
            mb={6}
          >
            <Controller
              name="documentParse.customPdf.url"
              control={control}
              render={({ field }) => (
                <ConnectivityTestInput
                  isInvalid={Boolean(form.getFieldState(field.name, form.formState).error)}
                  {...field}
                  isEditable
                  placeholder="https://pdf-parser.example.com/api"
                  renderLayout={({ input, button, result }) => (
                    <ConnectivityTestGroup
                      address={
                        <AdminFormItem
                          label={t('admin:custom_pdf_parser_service_url')}
                          tooltip={t(
                            'admin:full_url_of_the_custom_pdf_parsing_service_connectivity_can'
                          )}
                          isRequired
                          mb={4}
                        >
                          {input}
                        </AdminFormItem>
                      }
                      credential={
                        <AdminFormItem
                          label={t('admin:custom_parser_auth_key')}
                          tooltip={t(
                            'admin:bearer_token_used_when_calling_the_custom_parsing_service'
                          )}
                          mb={4}
                        >
                          <Controller
                            name="documentParse.customPdf.key"
                            control={control}
                            render={({ field }) => (
                              <AdminSecretInput
                                isInvalid={Boolean(
                                  form.getFieldState(field.name, form.formState).error
                                )}
                                name={field.name}
                                value={field.value}
                                onChange={field.onChange}
                                isConfigured={isSecretConfigured('documentParse.customPdf.key')}
                              />
                            )}
                          />
                        </AdminFormItem>
                      }
                      button={button}
                      result={result}
                    />
                  )}
                />
              )}
            />
          </Box>
        )}

        {documentParseProvider === 'sangfor' && (
          <Box
            p={5}
            bg={'white'}
            borderRadius={'lg'}
            borderWidth={'1px'}
            borderColor={'myGray.200'}
            mb={6}
          >
            <Controller
              name="documentParse.sangfor.url"
              control={control}
              render={({ field }) => (
                <ConnectivityTestInput
                  isInvalid={Boolean(form.getFieldState(field.name, form.formState).error)}
                  {...field}
                  isEditable
                  placeholder="https://sangfor-parse.example.com"
                  renderLayout={({ input, button, result }) => (
                    <ConnectivityTestGroup
                      address={
                        <AdminFormItem
                          label={t('admin:sangfor_parsing_api_endpoint')}
                          tooltip={t(
                            'admin:sangfor_document_parsing_microservice_url_connectivity_testi'
                          )}
                          isRequired
                          mb={4}
                        >
                          {input}
                        </AdminFormItem>
                      }
                      credential={
                        <AdminFormItem
                          label={t('admin:sangfor_service_key')}
                          tooltip={t('admin:sangfor_service_credential')}
                          mb={4}
                        >
                          <Controller
                            name="documentParse.sangfor.key"
                            control={control}
                            render={({ field }) => (
                              <AdminSecretInput
                                isInvalid={Boolean(
                                  form.getFieldState(field.name, form.formState).error
                                )}
                                name={field.name}
                                value={field.value}
                                onChange={field.onChange}
                                isConfigured={isSecretConfigured('documentParse.sangfor.key')}
                              />
                            )}
                          />
                        </AdminFormItem>
                      }
                      button={button}
                      result={result}
                    />
                  )}
                />
              )}
            />

            <SimpleGrid columns={[1, 2]} spacing={5} mt={4}>
              <AdminFormItem
                label={t('admin:supported_file_extensions')}
                tooltip={t('admin:comma_separated_extensions_e_g_pdf_docx')}
              >
                <Input
                  isInvalid={Boolean(
                    form.getFieldState('documentParse.sangfor.extensions', form.formState).error
                  )}
                  {...register('documentParse.sangfor.extensions')}
                  placeholder="pdf"
                />
              </AdminFormItem>
            </SimpleGrid>

            <AdminFormItem
              label={t('admin:request_timeout_seconds')}
              tooltip={t('admin:maximum_timeout_limit_default_600_seconds')}
              mb={0}
            >
              <Controller
                name="documentParse.sangfor.timeoutSeconds"
                control={control}
                render={({ field }) => (
                  <NumberInput
                    isInvalid={Boolean(form.getFieldState(field.name, form.formState).error)}
                    variant={'whiteOutline'}
                    maxW={'400px'}
                    min={10}
                    max={7200}
                    value={field.value ?? 600}
                    onChange={(_, val) => field.onChange(val || 600)}
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
          </Box>
        )}
      </AdminSettingSection>

      {/* 4. 邮箱 SMTP 服务 */}
      {showEmail && (
        <AdminSettingSection id="email" title={t('admin:email_notification_config')} showDivider>
          <SimpleGrid columns={[1, 2]} spacing={5}>
            <AdminFormItem
              label={t('admin:smtp_server_address')}
              tooltip={t('admin:mail_server_address_e_g_smtp_example_com')}
            >
              <Input
                isInvalid={Boolean(form.getFieldState('email.smtp', form.formState).error)}
                {...register('email.smtp')}
                placeholder="smtp.example.com"
              />
            </AdminFormItem>
            <AdminFormItem
              label={t('admin:sender_email_account')}
              tooltip={t('admin:account_used_to_send_system_notification_emails')}
            >
              <Input
                isInvalid={Boolean(form.getFieldState('email.user', form.formState).error)}
                {...register('email.user')}
                placeholder="no-reply@example.com"
              />
            </AdminFormItem>
            <AdminFormItem
              label={t('admin:email_auth_code_password')}
              tooltip={t('admin:smtp_login_credentials')}
            >
              <Controller
                name="email.pass"
                control={control}
                render={({ field }) => (
                  <AdminSecretInput
                    isInvalid={Boolean(form.getFieldState(field.name, form.formState).error)}
                    name={field.name}
                    value={field.value}
                    onChange={field.onChange}
                    isConfigured={auth.isSecretConfigured('loginProviders.email.pass')}
                  />
                )}
              />
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
                    isInvalid={Boolean(form.getFieldState(field.name, form.formState).error)}
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
                  name={field.name}
                  label={t('admin:enable_ssl')}
                  tooltip={t('admin:port_465_is_usually_enabled_port_587_recommends_starttls')}
                  isChecked={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </SimpleGrid>
        </AdminSettingSection>
      )}

      {/* 5. 阿里云短信服务 */}
      {showPhone && (
        <AdminSettingSection id="sms" title={t('admin:aliyun_sms_credentials')} showDivider>
          <SimpleGrid columns={[1, 3]} spacing={5}>
            <AdminFormItem
              label={t('admin:aliyun_accesskeyid')}
              tooltip={t('admin:sms_accesskey_id')}
            >
              <Input
                isInvalid={Boolean(form.getFieldState('phone.accessKeyId', form.formState).error)}
                {...register('phone.accessKeyId')}
                placeholder="******"
              />
            </AdminFormItem>
            <AdminFormItem
              label={t('admin:aliyun_accesskeysecret')}
              tooltip={t('admin:sms_accesskey_secret')}
            >
              <Controller
                name="phone.accessKeySecret"
                control={control}
                render={({ field }) => (
                  <AdminSecretInput
                    isInvalid={Boolean(form.getFieldState(field.name, form.formState).error)}
                    name={field.name}
                    value={field.value}
                    onChange={field.onChange}
                    isConfigured={auth.isSecretConfigured('loginProviders.phone.accessKeySecret')}
                  />
                )}
              />
            </AdminFormItem>
            <AdminFormItem
              label={t('admin:sms_signature')}
              tooltip={t('admin:signature_name_approved_in_the_aliyun_sms_console')}
            >
              <Input
                isInvalid={Boolean(form.getFieldState('phone.signName', form.formState).error)}
                {...register('phone.signName')}
                placeholder="FastGPT"
              />
            </AdminFormItem>
          </SimpleGrid>
        </AdminSettingSection>
      )}
    </AdminSettingPage>
  );
};

export default React.memo(CoreSettingComponent);
