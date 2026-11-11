import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import React, { useEffect } from 'react';
import { Box, Text } from '@chakra-ui/react';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { useDomainConfig } from '@/web/common/system/useDomainConfig';
import AdminSettingPage from '@/pageComponents/admin/settings/AdminSettingPage';
import AdminSettingSection from '@/pageComponents/admin/settings/AdminSettingSection';
import AdminFormItem from '@/pageComponents/admin/settings/AdminFormItem';
import AdminSwitchRow from '@/pageComponents/admin/settings/AdminSwitchRow';
import ConnectivityTestInput from '@/pageComponents/admin/settings/ConnectivityTestInput';
import type { SettingTOCItem } from '@/pageComponents/admin/settings/AdminSettingTOC';
import type { SystemInstanceConfigDomainMap } from '@fastgpt/global/common/system/config/schema';
import { isValidServiceBaseUrl } from '@fastgpt/global/common/string/url';

type SubserviceConfigForm = SystemInstanceConfigDomainMap['subservice'];

const McpSubserviceComponent = () => {
  const { t } = useSafeTranslation();
  const { effectiveConfig, isLoading, isUpdating, patchConfig } = useDomainConfig('subservice');

  const tocItems: SettingTOCItem[] = [
    { id: 'connection', label: t('admin:connection_connectivity') }
  ];

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<SubserviceConfigForm>({
    defaultValues: effectiveConfig
  });
  const enabled = useWatch({ control, name: 'mcp.enabled' }) ?? false;

  useEffect(() => {
    if (effectiveConfig && Object.keys(effectiveConfig).length > 0) {
      reset(effectiveConfig);
    }
  }, [effectiveConfig, reset]);

  const onSave = handleSubmit(async (formData) => {
    await patchConfig({ mcp: formData.mcp });
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
        <Controller
          name="mcp.enabled"
          control={control}
          render={({ field }) => (
            <AdminSwitchRow
              label={t('admin:enable_mcp_sse')}
              isChecked={field.value}
              onChange={field.onChange}
            />
          )}
        />
        {enabled && (
          <Box mt={6}>
            <AdminFormItem
              label={t('admin:mcp_sse_proxy_url')}
              tooltip={t('admin:public_sse_proxy_endpoint_external_clients_use_to_connect_to')}
              isRequired
              mb={0}
            >
              <Controller
                name="mcp.sseProxyUrl"
                control={control}
                rules={{
                  validate: (value) => {
                    if (!enabled) return true;
                    if (!value?.trim()) return t('admin:required');
                    return isValidServiceBaseUrl(value) || t('admin:invalid_subservice_base_url');
                  }
                }}
                render={({ field }) => (
                  <ConnectivityTestInput
                    {...field}
                    isEditable
                    service="mcpSse"
                    buttonVariant="solid"
                    placeholder="http://localhost:3003"
                    isInvalid={Boolean(errors.mcp?.sseProxyUrl)}
                  />
                )}
              />
              {errors.mcp?.sseProxyUrl && (
                <Text color={'red.500'} fontSize={'xs'} mt={1}>
                  {errors.mcp.sseProxyUrl.message ?? t('admin:required')}
                </Text>
              )}
            </AdminFormItem>
          </Box>
        )}
      </AdminSettingSection>
    </AdminSettingPage>
  );
};

export default React.memo(McpSubserviceComponent);
