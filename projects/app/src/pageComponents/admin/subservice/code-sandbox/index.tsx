import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import React, { useEffect, useMemo } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useDomainConfig } from '@/web/common/system/useDomainConfig';
import { Box, Input, Text, Wrap, Tag } from '@chakra-ui/react';
import AdminSettingPage from '@/pageComponents/admin/settings/AdminSettingPage';
import AdminSettingSection from '@/pageComponents/admin/settings/AdminSettingSection';
import AdminFormItem from '@/pageComponents/admin/settings/AdminFormItem';
import AdminSwitchRow from '@/pageComponents/admin/settings/AdminSwitchRow';
import ConnectivityTestInput from '@/pageComponents/admin/settings/ConnectivityTestInput';
import type { SettingTOCItem } from '@/pageComponents/admin/settings/AdminSettingTOC';
import type { SystemInstanceConfigDomainMap } from '@fastgpt/global/common/system/config/schema';
import { isValidServiceBaseUrl } from '@fastgpt/global/common/string/url';

type SubserviceConfigForm = SystemInstanceConfigDomainMap['subservice'];

const pythonBuiltins = [
  'math',
  'json',
  'datetime',
  're',
  'random',
  'hashlib',
  'collections',
  'requests',
  'numpy',
  'pandas'
];
const nodeBuiltins = ['crypto', 'path', 'url', 'lodash', 'dayjs', 'axios', 'qs'];

const CodeSandboxSubserviceComponent = () => {
  const { t } = useSafeTranslation();
  const { effectiveConfig, isLoading, isUpdating, patchConfig } = useDomainConfig('subservice');

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<SubserviceConfigForm>({
    defaultValues: effectiveConfig
  });
  const enabled = useWatch({ control, name: 'codeSandbox.enabled' }) ?? false;
  const token = useWatch({ control, name: 'codeSandbox.token' }) ?? '';
  const tocItems: SettingTOCItem[] = useMemo(
    () => [
      { id: 'connection', label: t('admin:connection_connectivity') },
      ...(enabled ? [{ id: 'modules', label: t('admin:runtime_module_support') }] : [])
    ],
    [enabled, t]
  );

  useEffect(() => {
    if (effectiveConfig && Object.keys(effectiveConfig).length > 0) {
      reset(effectiveConfig);
    }
  }, [effectiveConfig, reset]);

  const onSave = handleSubmit(async (formData) => {
    const url =
      formData.codeSandbox.enabled ||
      !formData.codeSandbox.url ||
      isValidServiceBaseUrl(formData.codeSandbox.url)
        ? formData.codeSandbox.url
        : (effectiveConfig.codeSandbox?.url ?? '');
    await patchConfig({ codeSandbox: { ...formData.codeSandbox, url } });
  });

  return (
    <AdminSettingPage
      headerTitle={t('admin:page_title_code_sandbox')}
      tocItems={tocItems}
      isLoading={isLoading}
      isSaving={isUpdating}
      onSave={onSave}
    >
      {/* 1. 连接与连通性 */}
      <AdminSettingSection id="connection" title={t('admin:connection_connectivity')}>
        <Controller
          name="codeSandbox.enabled"
          control={control}
          render={({ field }) => (
            <AdminSwitchRow
              label={t('admin:enable_code_sandbox')}
              tooltip={t('admin:enable_code_sandbox_tip')}
              isChecked={field.value}
              onChange={field.onChange}
            />
          )}
        />
        {enabled && (
          <Box mt={6}>
            <AdminFormItem label={t('admin:code_sandbox_url')} isRequired>
              <Controller
                name="codeSandbox.url"
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
                    service="codeSandbox"
                    token={token}
                    buttonVariant="solid"
                    placeholder="http://code-sandbox:3000"
                    isInvalid={Boolean(errors.codeSandbox?.url)}
                  />
                )}
              />
              {errors.codeSandbox?.url && (
                <Text color={'red.500'} fontSize={'xs'} mt={1}>
                  {errors.codeSandbox.url.message ?? t('admin:required')}
                </Text>
              )}
            </AdminFormItem>
            <AdminFormItem label={t('admin:code_sandbox_token')} isRequired mb={0}>
              <Controller
                name="codeSandbox.token"
                control={control}
                rules={{ validate: (value) => !enabled || Boolean(value?.trim()) }}
                render={({ field }) => (
                  <Input
                    {...field}
                    type="password"
                    placeholder="******"
                    isInvalid={Boolean(errors.codeSandbox?.token)}
                  />
                )}
              />
              {errors.codeSandbox?.token && (
                <Text color={'red.500'} fontSize={'xs'} mt={1}>
                  {t('admin:required')}
                </Text>
              )}
            </AdminFormItem>
          </Box>
        )}
      </AdminSettingSection>

      {/* 2. 运行时模块支持 */}
      {enabled && (
        <AdminSettingSection id="modules" title={t('admin:runtime_module_support')} showDivider>
          <AdminFormItem
            label={t('admin:supported_python_libraries')}
            tooltip={t('admin:python_packages_preinstalled_and_importable_in_the_code_sand')}
            mb={6}
          >
            <Box
              p={4}
              bg={'myGray.50'}
              borderRadius={'md'}
              borderWidth={'1px'}
              borderColor={'myGray.200'}
            >
              <Wrap spacing={2}>
                {pythonBuiltins.map((mod) => (
                  <Tag key={mod} size={'md'} colorScheme={'blue'} variant={'subtle'}>
                    {mod}
                  </Tag>
                ))}
              </Wrap>
            </Box>
          </AdminFormItem>

          <AdminFormItem
            label={t('admin:supported_node_js_libraries')}
            tooltip={t('admin:dependencies_available_by_default_in_javascript_code_nodes')}
          >
            <Box
              p={4}
              bg={'myGray.50'}
              borderRadius={'md'}
              borderWidth={'1px'}
              borderColor={'myGray.200'}
            >
              <Wrap spacing={2}>
                {nodeBuiltins.map((mod) => (
                  <Tag key={mod} size={'md'} colorScheme={'green'} variant={'subtle'}>
                    {mod}
                  </Tag>
                ))}
              </Wrap>
            </Box>
          </AdminFormItem>
        </AdminSettingSection>
      )}
    </AdminSettingPage>
  );
};

export default React.memo(CodeSandboxSubserviceComponent);
