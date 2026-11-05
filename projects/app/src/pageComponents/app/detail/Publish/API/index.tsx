import { useState } from 'react';
import { Box } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../../context';
import { ApiKeyTypeEnum } from '@fastgpt/global/support/openapi/constants';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import ApiKeyTable from '@/components/support/apikey/Table';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';

/** 两类凭证独立加载，切换后销毁表单和筛选状态，避免混用绑定或个人标签。 */
const API = ({ appId }: { appId: string }) => {
  const { t } = useSafeTranslation();
  const [keyType, setKeyType] = useState<ApiKeyTypeEnum>(ApiKeyTypeEnum.app);
  const canManage = useContextSelector(AppContext, (v) => v.appDetail.permission.hasManagePer);
  const tabs = (
    <FillRowTabs<ApiKeyTypeEnum>
      size="sm"
      value={keyType}
      onChange={setKeyType}
      list={[
        { label: t('apikey:app_key'), value: ApiKeyTypeEnum.app },
        { label: t('apikey:personal_key'), value: ApiKeyTypeEnum.personal }
      ]}
    />
  );
  return (
    <Box h="100%" display="flex" flexDirection="column" minH={0}>
      {keyType === ApiKeyTypeEnum.app && !canManage ? (
        <Box p={6}>
          {tabs}
          <EmptyTip text={t('apikey:app_key_manage_required')} />
        </Box>
      ) : (
        <ApiKeyTable key={keyType} mode="publish" appId={appId} keyType={keyType} title={tabs} />
      )}
    </Box>
  );
};

export default API;
