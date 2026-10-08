import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import React from 'react';
import { useDomainConfig } from '@/web/common/system/useDomainConfig';
import { Box, Wrap, Tag } from '@chakra-ui/react';
import {
  AdminSettingPage,
  AdminSettingSection,
  AdminFormItem,
  ConnectivityTestInput,
  type SettingTOCItem
} from '@/pageComponents/admin/settings';

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
  const { t } = useClientTranslation('admin');
  const { effectiveConfig, isLoading } = useDomainConfig('subservice');
  const baseUrl = effectiveConfig?.codeSandbox?.baseUrl || 'http://localhost:3002';
  const sandboxHealthUrl = baseUrl.replace(/\/+$/, '') + '/health';

  const tocItems: SettingTOCItem[] = [
    { id: 'connection', label: t('admin:connection_connectivity') },
    { id: 'modules', label: t('admin:runtime_module_support') }
  ];

  return (
    <AdminSettingPage
      headerTitle={t('admin:page_title_code_sandbox')}
      tocItems={tocItems}
      isLoading={isLoading}
    >
      {/* 1. 连接与连通性 */}
      <AdminSettingSection id="connection" title={t('admin:connection_connectivity')}>
        <AdminFormItem
          label={t('admin:code_sandbox_health_check_endpoint')}
          tooltip={t('admin:full_endpoint_fastgpt_uses_to_probe_the_code_sandbox_process')}
          mb={0}
        >
          <ConnectivityTestInput url={sandboxHealthUrl} placeholder="http://sandbox:3002/health" />
        </AdminFormItem>
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
