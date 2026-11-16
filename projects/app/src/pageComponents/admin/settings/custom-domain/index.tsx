import React, { useEffect, useMemo } from 'react';
import { Input, SimpleGrid, Textarea } from '@chakra-ui/react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import type { SystemInstanceConfigDomainMap } from '@fastgpt/global/common/system/config/schema';
import { useDomainConfig } from '@/web/common/system/useDomainConfig';
import { useAdminPermission } from '@/pageComponents/admin/useAdminPermission';
import AdminSettingPage from '../AdminSettingPage';
import AdminSettingSection from '../AdminSettingSection';
import AdminFormItem from '../AdminFormItem';
import AdminSwitchRow from '../AdminSwitchRow';

type CustomDomainForm = SystemInstanceConfigDomainMap['site']['customDomain'];

/** SaaS 自定义域名独立配置页，仅提交 site.customDomain，避免覆盖同域的其它站点设置。 */
const CustomDomainSettingComponent = () => {
  const { t } = useSafeTranslation();
  const providers = useMemo(
    () =>
      [
        { key: 'aliyun', label: t('admin:custom_domain_provider_aliyun') },
        { key: 'tencent', label: t('admin:custom_domain_provider_tencent') },
        { key: 'volcengine', label: t('admin:custom_domain_provider_volcengine') }
      ] as const,
    [t]
  );
  const { filterConfigData } = useAdminPermission();
  const { effectiveConfig, isLoading, isUpdating, patchConfig } = useDomainConfig('site');
  const { register, control, handleSubmit, reset } = useForm<CustomDomainForm>({
    defaultValues: effectiveConfig.customDomain
  });
  const enabled = useWatch({ control, name: 'enable' });

  useEffect(() => {
    if (!isLoading) reset(effectiveConfig.customDomain);
  }, [effectiveConfig.customDomain, isLoading, reset]);

  const tocItems = useMemo(
    () => [
      { id: 'general', label: t('admin:custom_domain') },
      ...(enabled ? providers.map(({ key, label }) => ({ id: key, label })) : [])
    ],
    [enabled, providers, t]
  );

  const onSave = handleSubmit(async (customDomain) => {
    await patchConfig(filterConfigData('site', { customDomain }) as Record<string, unknown>);
  });

  return (
    <AdminSettingPage
      headerTitle={t('admin:custom_domain')}
      tocItems={tocItems}
      isLoading={isLoading}
      isSaving={isUpdating}
      onSave={onSave}
    >
      <AdminSettingSection id="general" title={t('admin:custom_domain')}>
        <Controller
          name="enable"
          control={control}
          render={({ field }) => (
            <AdminSwitchRow
              label={t('admin:enable_custom_domain')}
              tooltip={t('admin:enable_custom_domain_tip')}
              isChecked={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </AdminSettingSection>
      {enabled &&
        providers.map(({ key, label }) => (
          <AdminSettingSection key={key} id={key} title={label} showDivider>
            <SimpleGrid columns={[1, 1, 3]} spacing={5} mb={5}>
              <AdminFormItem label={t('admin:custom_domain_cname')}>
                <Input {...register(`domain.${key}`)} placeholder="example.com" />
              </AdminFormItem>
              <AdminFormItem label={t('admin:custom_domain_issuer_service_name')}>
                <Input {...register(`issuerServiceName.${key}`)} />
              </AdminFormItem>
              <AdminFormItem label={t('admin:custom_domain_nginx_service_name')}>
                <Input {...register(`nginxServiceName.${key}`)} />
              </AdminFormItem>
            </SimpleGrid>
            <AdminFormItem label={t('admin:custom_domain_kubeconfig')}>
              <Textarea
                {...register(`kc.${key}`)}
                rows={8}
                resize={'vertical'}
                spellCheck={false}
                autoComplete={'off'}
              />
            </AdminFormItem>
          </AdminSettingSection>
        ))}
    </AdminSettingPage>
  );
};

export default React.memo(CustomDomainSettingComponent);
