import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import React, { useEffect, useMemo } from 'react';
import { Box, Textarea, SimpleGrid } from '@chakra-ui/react';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { useDomainConfig } from '@/web/common/system/useDomainConfig';
import AdminSettingPage from '@/pageComponents/admin/settings/AdminSettingPage';
import AdminSettingSection from '@/pageComponents/admin/settings/AdminSettingSection';
import AdminSwitchRow from '@/pageComponents/admin/settings/AdminSwitchRow';
import type { SettingTOCItem } from '@/pageComponents/admin/settings/AdminSettingTOC';
import type { SystemInstanceConfigDomainMap } from '@fastgpt/global/common/system/config/schema';

type SecurityConfigForm = Omit<
  SystemInstanceConfigDomainMap['security'],
  | 'allowedOrigins'
  | 'allowedOriginsEnabled'
  | 'fileUrlWhitelist'
  | 'passwordLoginMinuteLimitCount'
  | 'maxLoginSession'
> & {
  allowedOriginsEnabled: boolean;
  allowedOriginsText: string;
  fileUrlWhitelistText: string;
};

const SecuritySettingComponent = () => {
  const { t } = useSafeTranslation();
  const tocItems: SettingTOCItem[] = useMemo(
    () => [
      { id: 'basic', label: t('admin:security_section_basic') },
      // id 必须与下方 AdminSettingSection 一致：TOC 滚动定位与 ScrollSpy 都按 id 匹配
      { id: 'fileAndRisk', label: t('admin:security_section_file') }
    ],
    [t]
  );

  const { effectiveConfig, isLoading, isUpdating, patchConfig } = useDomainConfig('security');

  const form = useForm<SecurityConfigForm>({
    defaultValues: {
      checkInternalIp: false,
      csrfEnabled: true,
      authCookieSecure: false,
      skipFileTypeCheck: false,
      checkExternalFile: false,
      allowedOriginsEnabled: false,
      allowedOriginsText: '',
      fileUrlWhitelistText: '',
      workflowHttpNode: { ignoreHttpsCertificate: false }
    }
  });
  const { control, handleSubmit, reset, register } = form;

  const checkExternalFile = useWatch({ control, name: 'checkExternalFile' });
  const allowedOriginsEnabled = useWatch({ control, name: 'allowedOriginsEnabled' });

  useEffect(() => {
    if (effectiveConfig && Object.keys(effectiveConfig).length > 0) {
      /** 读取保留的非法旧值也要能显示和编辑；不在页面初始化时丢弃或写回数据库。 */
      const toListText = (value: unknown): string => {
        if (value === undefined) return '';
        if (typeof value === 'string') return value;
        if (Array.isArray(value)) {
          return value
            .map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
            .join('\n');
        }
        return JSON.stringify(value) ?? '';
      };

      reset({
        ...effectiveConfig,
        allowedOriginsEnabled:
          effectiveConfig.allowedOriginsEnabled ?? Boolean(effectiveConfig.allowedOrigins?.length),
        allowedOriginsText: toListText(effectiveConfig.allowedOrigins),
        fileUrlWhitelistText: toListText(effectiveConfig.fileUrlWhitelist)
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
      checkInternalIp: Boolean(formData.checkInternalIp),
      csrfEnabled: Boolean(formData.csrfEnabled),
      authCookieSecure: Boolean(formData.authCookieSecure),
      skipFileTypeCheck: Boolean(formData.skipFileTypeCheck),
      checkExternalFile: Boolean(formData.checkExternalFile),
      allowedOriginsEnabled: Boolean(formData.allowedOriginsEnabled),
      allowedOrigins: parseList(formData.allowedOriginsText),
      fileUrlWhitelist: parseList(formData.fileUrlWhitelistText),
      workflowHttpNode: formData.workflowHttpNode
    };

    // 登录防护已迁至账号与登录页，局部提交以保留其在本域的现有值
    await patchConfig(payload);
  });

  return (
    <AdminSettingPage
      form={form}
      fieldAliases={{
        'security.allowedOrigins': 'allowedOriginsText',
        'security.fileUrlWhitelist': 'fileUrlWhitelistText'
      }}
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
            name="checkInternalIp"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                name={field.name}
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
                name={field.name}
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
                name={field.name}
                label={t('admin:http_node_ignore_https_certificate')}
                tooltip={t('admin:high_risk_enabling_this_stops_validating_invalid_or_self_sig')}
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />

          <Controller
            name="authCookieSecure"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                name={field.name}
                label={t('admin:auth_cookie_secure')}
                tooltip={t('admin:auth_cookie_secure_tip')}
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </SimpleGrid>

        <Box mb={6}>
          <SimpleGrid columns={1}>
            <Controller
              name="allowedOriginsEnabled"
              control={control}
              render={({ field }) => (
                <AdminSwitchRow
                  name={field.name}
                  label={t('admin:allowed_origins')}
                  tooltip={t('admin:origins_allowed_to_call_the_main_site_api_default_means_unre')}
                  isChecked={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </SimpleGrid>
          {allowedOriginsEnabled && (
            <Box mt={2}>
              <Textarea
                isInvalid={Boolean(form.getFieldState('allowedOriginsText', form.formState).error)}
                {...register('allowedOriginsText')}
                aria-label={t('admin:allowed_origins')}
                rows={4}
                placeholder={'https://app.example.com\nhttps://chat.example.com'}
              />
            </Box>
          )}
        </Box>
      </AdminSettingSection>

      {/* 2. 文件安全 */}
      <AdminSettingSection id="fileAndRisk" title={t('admin:file_security')} showDivider>
        <SimpleGrid columns={[1, 2]} spacingX={16} spacingY={4} mb={6}>
          <Controller
            name="skipFileTypeCheck"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                name={field.name}
                label={t('admin:upload_file_type_check')}
                tooltip={t('admin:upload_file_type_check_tip')}
                isChecked={!field.value}
                onChange={(checked) => field.onChange(!checked)}
              />
            )}
          />
        </SimpleGrid>

        <Box mb={6}>
          <SimpleGrid columns={1}>
            <Controller
              name="checkExternalFile"
              control={control}
              render={({ field }) => (
                <AdminSwitchRow
                  name={field.name}
                  label={t('admin:check_external_file')}
                  tooltip={t('admin:check_external_file_tip')}
                  isChecked={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </SimpleGrid>
          {checkExternalFile && (
            <Box mt={2}>
              <Textarea
                isInvalid={Boolean(
                  form.getFieldState('fileUrlWhitelistText', form.formState).error
                )}
                {...register('fileUrlWhitelistText')}
                aria-label={t('admin:external_resource_domain_whitelist')}
                rows={3}
                placeholder={'cdn.example.com\noss.example.com'}
              />
            </Box>
          )}
        </Box>
      </AdminSettingSection>
    </AdminSettingPage>
  );
};

export default React.memo(SecuritySettingComponent);
