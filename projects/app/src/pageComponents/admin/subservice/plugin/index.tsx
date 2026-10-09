import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import React, { useEffect, useMemo } from 'react';
import { Input } from '@chakra-ui/react';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { useDomainConfig } from '@/web/common/system/useDomainConfig';
import AdminSettingPage from '@/pageComponents/admin/settings/AdminSettingPage';
import AdminSettingSection from '@/pageComponents/admin/settings/AdminSettingSection';
import AdminFormItem from '@/pageComponents/admin/settings/AdminFormItem';
import AdminSwitchRow from '@/pageComponents/admin/settings/AdminSwitchRow';
import ConnectivityTestInput from '@/pageComponents/admin/settings/ConnectivityTestInput';
import type { SettingTOCItem } from '@/pageComponents/admin/settings/AdminSettingTOC';
import type { SystemInstanceConfigDomainMap } from '@fastgpt/global/common/system/config/type';

type SubserviceConfigForm = SystemInstanceConfigDomainMap['subservice'];

const PluginSubserviceComponent = () => {
  const { t } = useClientTranslation('admin');
  const { effectiveConfig, isLoading, isUpdating, patchConfig } = useDomainConfig('subservice');

  const tocItems: SettingTOCItem[] = useMemo(
    () => [
      { id: 'connection', label: t('admin:connection_status') },
      { id: 'features', label: t('admin:runtime_features') }
    ],
    [t]
  );

  const { control, handleSubmit, reset, register } = useForm<SubserviceConfigForm>({
    defaultValues: effectiveConfig
  });

  useEffect(() => {
    if (effectiveConfig && Object.keys(effectiveConfig).length > 0) {
      reset(effectiveConfig);
    }
  }, [effectiveConfig, reset]);

  const baseUrl = effectiveConfig?.plugin?.baseUrl || 'http://localhost:3004';
  const pluginHealthUrl = baseUrl.replace(/\/+$/, '') + '/health';
  const remoteDebug = useWatch({ control, name: 'plugin.remoteDebug' });

  const onSave = handleSubmit(async (formData) => {
    await patchConfig({ plugin: formData.plugin });
  });

  return (
    <AdminSettingPage
      headerTitle={t('admin:page_title_plugin')}
      tocItems={tocItems}
      isLoading={isLoading}
      isSaving={isUpdating}
      onSave={onSave}
    >
      {/* 1. 连接与状态 */}
      <AdminSettingSection id="connection" title={t('admin:connection_status')}>
        <AdminFormItem
          label={t('admin:plugin_gateway_health_check_endpoint')}
          tooltip={t('admin:plugin_service_liveness_probe_url_inside_docker_k8s_built_fr')}
          mb={0}
        >
          <ConnectivityTestInput url={pluginHealthUrl} placeholder="http://plugin:3004/health" />
        </AdminFormItem>
      </AdminSettingSection>

      {/* 2. 运行时特性 */}
      <AdminSettingSection id="features" title={t('admin:runtime_features')} showDivider>
        <Controller
          name="plugin.remoteDebug"
          control={control}
          render={({ field }) => (
            <AdminSwitchRow
              label={t('admin:enable_plugin_remote_debug_channel')}
              tooltip={t('admin:when_enabled_developers_can_connect_to_the_plugin_service_fr')}
              isChecked={field.value}
              onChange={field.onChange}
            />
          )}
        />

        {remoteDebug && (
          <AdminFormItem
            label={t('admin:plugin_remote_debug_url')}
            tooltip={t('admin:plugin_remote_debug_url_tip')}
            isRequired
            mb={0}
          >
            <Input {...register('plugin.remoteDebugUrl')} placeholder="https://debug.example.com" />
          </AdminFormItem>
        )}
      </AdminSettingSection>
    </AdminSettingPage>
  );
};

export default React.memo(PluginSubserviceComponent);
