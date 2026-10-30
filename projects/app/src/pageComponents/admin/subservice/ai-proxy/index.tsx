import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import React from 'react';
import { useDomainConfig } from '@/web/common/system/useDomainConfig';
import AdminSettingPage from '@/pageComponents/admin/settings/AdminSettingPage';
import AdminSettingSection from '@/pageComponents/admin/settings/AdminSettingSection';
import AdminFormItem from '@/pageComponents/admin/settings/AdminFormItem';
import ConnectivityTestInput from '@/pageComponents/admin/settings/ConnectivityTestInput';
import type { SettingTOCItem } from '@/pageComponents/admin/settings/AdminSettingTOC';

const AiProxySubserviceComponent = () => {
  const { t } = useSafeTranslation();
  const { effectiveConfig, isLoading } = useDomainConfig('subservice');
  const endpoint = effectiveConfig?.aiProxy?.endpoint || 'http://localhost:3000';
  const aiProxyHealthUrl = endpoint.replace(/\/+$/, '') + '/api/status';

  const tocItems: SettingTOCItem[] = [
    { id: 'connection', label: t('admin:connection_connectivity') }
  ];

  return (
    <AdminSettingPage
      headerTitle={t('admin:page_title_ai_proxy')}
      tocItems={tocItems}
      isLoading={isLoading}
    >
      {/* 1. 连接与连通性 */}
      <AdminSettingSection id="connection" title={t('admin:connection_connectivity')}>
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
