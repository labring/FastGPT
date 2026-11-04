import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import React, { useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useDomainConfig } from '@/web/common/system/useDomainConfig';
import AdminSettingPage from '@/pageComponents/admin/settings/AdminSettingPage';
import AdminSettingSection from '@/pageComponents/admin/settings/AdminSettingSection';
import AdminFormItem from '@/pageComponents/admin/settings/AdminFormItem';
import AdminSwitchRow from '@/pageComponents/admin/settings/AdminSwitchRow';
import ConnectivityTestInput from '@/pageComponents/admin/settings/ConnectivityTestInput';
import type { SettingTOCItem } from '@/pageComponents/admin/settings/AdminSettingTOC';
import type { SystemInstanceConfigDomainMap } from '@fastgpt/global/common/system/config/type';

type SubserviceConfigForm = SystemInstanceConfigDomainMap['subservice'];

const AiProxySubserviceComponent = () => {
  const { t } = useSafeTranslation();
  const { effectiveConfig, isLoading, isUpdating, patchConfig } = useDomainConfig('subservice');
  const endpoint = effectiveConfig?.aiProxy?.endpoint || 'http://localhost:3000';
  const aiProxyHealthUrl = endpoint.replace(/\/+$/, '') + '/api/status';

  const tocItems: SettingTOCItem[] = useMemo(
    () => [{ id: 'connection', label: t('admin:connection_connectivity') }],
    [t]
  );

  const { control, handleSubmit, reset } = useForm<SubserviceConfigForm>({
    defaultValues: effectiveConfig
  });

  useEffect(() => {
    if (effectiveConfig && Object.keys(effectiveConfig).length > 0) {
      reset(effectiveConfig);
    }
  }, [effectiveConfig, reset]);

  const onSave = handleSubmit(async (formData) => {
    await patchConfig({ aiProxy: formData.aiProxy });
  });

  return (
    <AdminSettingPage
      headerTitle={t('admin:page_title_ai_proxy')}
      tocItems={tocItems}
      isLoading={isLoading}
      isSaving={isUpdating}
      onSave={onSave}
    >
      {/* 1. 连接与连通性 */}
      <AdminSettingSection id="connection" title={t('admin:connection_connectivity')}>
        <Controller
          name="aiProxy.enabled"
          control={control}
          render={({ field }) => (
            <AdminSwitchRow
              label={t('admin:enable_ai_proxy')}
              tooltip={t('admin:enable_ai_proxy_tip')}
              isChecked={field.value}
              onChange={field.onChange}
            />
          )}
        />

        <AdminFormItem
          label={t('admin:ai_proxy_health_check_endpoint')}
          tooltip={t('admin:full_endpoint_the_main_site_uses_to_call_the_ai_proxy_and_pr')}
          mb={0}
        >
          <ConnectivityTestInput
            url={aiProxyHealthUrl}
            placeholder="http://aiproxy:3000/api/status"
          />
        </AdminFormItem>
      </AdminSettingSection>
    </AdminSettingPage>
  );
};

export default React.memo(AiProxySubserviceComponent);
