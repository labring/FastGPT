import React from 'react';
import ApiKeyTable from '@/components/support/apikey/Table';
import { useI18n } from '@/web/context/I18n';
import { Box } from '@chakra-ui/react';
import AccountContainer, { TabEnum } from './components/AccountContainer';
import { serviceSideProps } from '../../web/common/utils/i18n';

const ApiKey = () => {
  const { publishT } = useI18n();
  return (
    <AccountContainer currentTab={TabEnum.apikey}>
      <Box px={[4, 8]} py={[4, 6]}>
        <ApiKeyTable tips={publishT('key_tips')}></ApiKeyTable>
      </Box>
    </AccountContainer>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      currentTab: content?.query?.currentTab || TabEnum.info,
      ...(await serviceSideProps(content, ['publish', 'user']))
    }
  };
}

export default ApiKey;
