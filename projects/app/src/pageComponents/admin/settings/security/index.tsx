import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import React, { useEffect, useMemo } from 'react';
import { Input, Textarea, SimpleGrid } from '@chakra-ui/react';
import { useForm, Controller } from 'react-hook-form';
import { useDomainConfig } from '@/web/common/system/useDomainConfig';
import AdminSettingPage from '@/pageComponents/admin/settings/AdminSettingPage';
import AdminSettingSection from '@/pageComponents/admin/settings/AdminSettingSection';
import AdminFormItem from '@/pageComponents/admin/settings/AdminFormItem';
import AdminSwitchRow from '@/pageComponents/admin/settings/AdminSwitchRow';
import type { SettingTOCItem } from '@/pageComponents/admin/settings/AdminSettingTOC';
import type { SystemInstanceConfigDomainMap } from '@fastgpt/global/common/system/config/type';

type SecurityConfigForm = Omit<
  SystemInstanceConfigDomainMap['security'],
  'allowedOrigins' | 'fileUrlWhitelist' | 'passwordLoginMinuteLimitCount' | 'maxLoginSession'
> & {
  allowedOriginsText: string;
  fileUrlWhitelistText: string;
};

const SecuritySettingComponent = () => {
  const { t } = useClientTranslation('admin');
  const tocItems: SettingTOCItem[] = useMemo(
    () => [
      { id: 'basic', label: t('admin:security_section_basic') },
      // id 必须与下方 AdminSettingSection 一致：TOC 滚动定位与 ScrollSpy 都按 id 匹配
      { id: 'fileAndRisk', label: t('admin:security_section_file') },
      { id: 'modelCensor', label: t('admin:security_section_censor') }
    ],
    [t]
  );

  const { effectiveConfig, isLoading, isUpdating, patchConfig } = useDomainConfig('security');

  const { control, handleSubmit, reset, register } = useForm<SecurityConfigForm>({
    defaultValues: {
      useIpLimit: false,
      checkInternalIp: false,
      csrfEnabled: true,
      skipFileTypeCheck: false,
      allowedOriginsText: '',
      fileUrlWhitelistText: '',
      censor: { baiduClientId: '', baiduClientSecret: '', customCensorUrl: '' },
      workflowHttpNode: { ignoreHttpsCertificate: false }
    }
  });

  useEffect(() => {
    if (effectiveConfig && Object.keys(effectiveConfig).length > 0) {
      reset({
        ...effectiveConfig,
        allowedOriginsText: (effectiveConfig.allowedOrigins ?? []).join('\n'),
        fileUrlWhitelistText: (effectiveConfig.fileUrlWhitelist ?? []).join('\n')
      });
    }
  }, [effectiveConfig, reset]);

  const onSave = handleSubmit(async (formData) => {
    // 换行与逗号分割转换字符串为数组
    const parseList = (text: string) =>
      text
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean);

    const payload = {
      useIpLimit: Boolean(formData.useIpLimit),
      checkInternalIp: Boolean(formData.checkInternalIp),
      csrfEnabled: Boolean(formData.csrfEnabled),
      skipFileTypeCheck: Boolean(formData.skipFileTypeCheck),
      allowedOrigins: parseList(formData.allowedOriginsText),
      fileUrlWhitelist: parseList(formData.fileUrlWhitelistText),
      censor: formData.censor,
      workflowHttpNode: formData.workflowHttpNode
    };

    // 登录防护已迁至账号与登录页，局部提交以保留其在本域的现有值
    await patchConfig(payload);
  });

  return (
    <AdminSettingPage
      headerTitle={t('admin:page_title_security')}
      tocItems={tocItems}
      isLoading={isLoading}
      isSaving={isUpdating}
      onSave={onSave}
    >
      {/* 1. 基础 */}
      <AdminSettingSection id="basic" title={t('admin:security_section_basic')}>
        <SimpleGrid columns={[1, 2]} spacingX={16} spacingY={4} mb={6}>
          <Controller
            name="useIpLimit"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label={t('admin:ip_rate_limiting')}
                tooltip={t('admin:when_enabled_main_site_requests_are_subject_to_a_unified_ip')}
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />

          <Controller
            name="checkInternalIp"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label={t('admin:internal_ip_access_blocking_ssrf')}
                tooltip={t('admin:when_enabled_outgoing_http_requests_from_the_main_site_are_b')}
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />

          <Controller
            name="csrfEnabled"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label={t('admin:strict_csrf_validation')}
                tooltip={t('admin:protects_against_csrf_attacks_keep_enabled_in_production')}
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />

          <Controller
            name="workflowHttpNode.ignoreHttpsCertificate"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label={t('admin:http_node_ignore_https_certificate')}
                tooltip={t('admin:high_risk_enabling_this_stops_validating_invalid_or_self_sig')}
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </SimpleGrid>

        <AdminFormItem
          label={t('admin:allowed_origins')}
          tooltip={t('admin:origins_allowed_to_call_the_main_site_api_default_means_unre')}
        >
          <Textarea
            {...register('allowedOriginsText')}
            rows={4}
            placeholder="https://app.example.com&#10;https://chat.example.com"
          />
        </AdminFormItem>
      </AdminSettingSection>

      {/* 2. 文件安全 */}
      <AdminSettingSection id="fileAndRisk" title={t('admin:file_security')} showDivider>
        <SimpleGrid columns={[1, 2]} spacingX={16} spacingY={4} mb={6}>
          <Controller
            name="skipFileTypeCheck"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label={t('admin:skip_file_type_check')}
                tooltip={t('admin:high_risk_enabling_this_stops_strict_mime_magic_number_valid')}
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </SimpleGrid>

        <AdminFormItem
          label={t('admin:external_resource_domain_whitelist')}
          tooltip={t('admin:domain_list_allowed_for_loading_external_file_resources_sepa')}
        >
          <Textarea
            {...register('fileUrlWhitelistText')}
            rows={3}
            placeholder="https://cdn.example.com&#10;https://oss.example.com"
          />
        </AdminFormItem>
      </AdminSettingSection>

      {/* 3. 模型内容审查 */}
      <AdminSettingSection id="modelCensor" title={t('admin:model_content_moderation')} showDivider>
        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem
            label={t('admin:baidu_moderation_clientid')}
            tooltip={t('admin:api_key_for_baidu_text_content_moderation')}
          >
            <Input {...register('censor.baiduClientId')} placeholder="******" />
          </AdminFormItem>

          <AdminFormItem
            label={t('admin:baidu_moderation_clientsecret')}
            tooltip={t('admin:secret_key_for_baidu_text_content_moderation')}
          >
            <Input type="password" {...register('censor.baiduClientSecret')} placeholder="******" />
          </AdminFormItem>

          <AdminFormItem
            label={t('admin:custom_content_moderation_url')}
            tooltip={t('admin:custom_content_moderation_url_takes_precedence_over_baidu_mo')}
          >
            <Input
              {...register('censor.customCensorUrl')}
              placeholder="https://censor.example.com"
            />
          </AdminFormItem>
        </SimpleGrid>
      </AdminSettingSection>
    </AdminSettingPage>
  );
};

export default React.memo(SecuritySettingComponent);
