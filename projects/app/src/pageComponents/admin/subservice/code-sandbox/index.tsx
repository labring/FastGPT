import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import React, { useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useDomainConfig } from '@/web/common/system/useDomainConfig';
import { Box, Wrap, Tag } from '@chakra-ui/react';
import AdminSettingPage from '@/pageComponents/admin/settings/AdminSettingPage';
import AdminSettingSection from '@/pageComponents/admin/settings/AdminSettingSection';
import AdminFormItem from '@/pageComponents/admin/settings/AdminFormItem';
import AdminSwitchRow from '@/pageComponents/admin/settings/AdminSwitchRow';
import type { SettingTOCItem } from '@/pageComponents/admin/settings/AdminSettingTOC';
import type { SystemInstanceConfigDomainMap } from '@fastgpt/global/common/system/config/schema';

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

  const tocItems: SettingTOCItem[] = useMemo(
    () => [
      { id: 'connection', label: t('admin:connection_connectivity') },
      { id: 'modules', label: t('admin:runtime_module_support') }
    ],
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
    await patchConfig({ codeSandbox: formData.codeSandbox });
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
      </AdminSettingSection>

      {/* 2. 运行时模块支持 */}
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
    </AdminSettingPage>
  );
};

export default React.memo(CodeSandboxSubserviceComponent);
