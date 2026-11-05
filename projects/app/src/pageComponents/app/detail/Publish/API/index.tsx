import { useState } from 'react';
import { Box, Tabs, TabList, Tab } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../../context';
import { ApiKeyTypeEnum } from '@fastgpt/global/support/openapi/constants';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import ApiKeyTable from '@/components/support/apikey/Table';

/** 两类凭证独立加载，切换后销毁表单和筛选状态，避免混用绑定或个人标签。 */
const API = ({ appId }: { appId: string }) => {
  const { t } = useSafeTranslation();
  const [tab, setTab] = useState(0);
  const canManage = useContextSelector(AppContext, (v) => v.appDetail.permission.hasManagePer);
  const keyType = tab === 0 ? ApiKeyTypeEnum.app : ApiKeyTypeEnum.personal;
  return (
    <Box h="100%" display="flex" flexDirection="column" minH={0}>
      <Tabs index={tab} onChange={setTab} px={6} pt={4}>
        <TabList>
          <Tab>{t('apikey:app_key')}</Tab>
          <Tab>{t('apikey:personal_key')}</Tab>
        </TabList>
      </Tabs>
      <Box px={6} pt={3} color="myGray.600" fontSize="sm">
        {keyType === ApiKeyTypeEnum.app ? t('apikey:app_key_tip') : t('apikey:personal_key_tip')}
      </Box>
      <Box as="details" mx={6} mt={2} fontSize="sm">
        <Box as="summary" cursor="pointer">
          {t('apikey:call_example')}
        </Box>
        <Box
          as="pre"
          mt={2}
          p={3}
          bg="myGray.50"
          overflowX="auto"
        >{`curl -X POST 'https://your-fastgpt.example/api/v2/chat/completions' -H 'Authorization: Bearer ${keyType === ApiKeyTypeEnum.app ? 'APP_API_KEY' : 'PERSONAL_API_KEY'}' -H 'Content-Type: application/json' -d '${JSON.stringify({ ...(keyType === ApiKeyTypeEnum.personal ? { appId } : {}), customUid: 'user-10001', messages: [{ role: 'user', content: 'Hello' }] })}'`}</Box>
      </Box>
      {keyType === ApiKeyTypeEnum.app && !canManage ? (
        <Box p={6}>{t('apikey:app_key_manage_required')}</Box>
      ) : (
        <ApiKeyTable key={keyType} mode="publish" appId={appId} keyType={keyType} />
      )}
    </Box>
  );
};

export default API;
