import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import React, { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useDomainConfig } from '@/web/common/system/useDomainConfig';
import AdminSettingPage from '@/pageComponents/admin/settings/AdminSettingPage';
import AdminSettingSection from '@/pageComponents/admin/settings/AdminSettingSection';
import AdminFormItem from '@/pageComponents/admin/settings/AdminFormItem';
import ConnectivityTestInput from '@/pageComponents/admin/settings/ConnectivityTestInput';
import type { SettingTOCItem } from '@/pageComponents/admin/settings/AdminSettingTOC';
import type { SystemInstanceConfigDomainMap } from '@fastgpt/global/common/system/config/type';

type SubserviceConfigForm = SystemInstanceConfigDomainMap['subservice'];

const McpSubserviceComponent = () => {
  const { t } = useSafeTranslation();
  const { effectiveConfig, isLoading, isUpdating, patchConfig } = useDomainConfig('subservice');

  const tocItems: SettingTOCItem[] = [
    { id: 'connection', label: t('admin:connection_connectivity') }
  ];

  const { control, handleSubmit, reset } = useForm<SubserviceConfigForm>({
    defaultValues: effectiveConfig
  });

  useEffect(() => {
    if (effectiveConfig && Object.keys(effectiveConfig).length > 0) {
      reset(effectiveConfig);
    }
  }, [effectiveConfig, reset]);

  const onSave = handleSubmit(async (formData) => {
    await patchConfig({
      mcp: {
        enabled: Boolean(formData.mcp?.sseProxyUrl),
        sseProxyUrl: formData.mcp?.sseProxyUrl || ''
      }
    });
  });

  return (
    <AdminSettingPage
      headerTitle={t('admin:page_title_mcp')}
      tocItems={tocItems}
      isLoading={isLoading}
      isSaving={isUpdating}
      onSave={onSave}
    >
      {/* 1. 连接与连通性 */}
      <AdminSettingSection id="connection" title={t('admin:connection_connectivity')}>
        <AdminFormItem
          label={t('admin:mcp_sse_proxy_url')}
          tooltip={t('admin:public_sse_proxy_endpoint_external_clients_use_to_connect_to')}
          mb={0}
        >
          <Controller
            name="mcp.sseProxyUrl"
            control={control}
            render={({ field }) => (
              <ConnectivityTestInput {...field} isEditable placeholder="http://localhost:3003" />
            )}
          />
        </AdminFormItem>
      </AdminSettingSection>
    </AdminSettingPage>
  );
};

export default React.memo(McpSubserviceComponent);
