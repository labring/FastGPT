import { serviceSideProps } from '@fastgpt/web/common/system/nextjs';
import React, { useState } from 'react';
import AccountContainer from '../components/AccountContainer';
import { Box, Button, Flex, useDisclosure } from '@chakra-ui/react';
import ModelTable from '@/components/core/ai/ModelTable';
import { useUserStore } from '@/web/support/user/useUserStore';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { useTranslation } from 'next-i18next';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import dynamic from 'next/dynamic';

const DefaultModal = dynamic(() => import('./components/DefaultModal'), {
  ssr: false
});

const ModelProvider = () => {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();
  const isRoot = userInfo?.username === 'root';

  const [tab, setTab] = useState<'model' | 'channel'>('model');

  const { isOpen: isOpenDefault, onOpen: onOpenDefault, onClose: onCloseDefault } = useDisclosure();

  return (
    <AccountContainer>
      <Flex h={'100%'} flexDirection={'column'} gap={4} py={4} px={6}>
        {/* Header */}
        {/* <Flex justifyContent={'space-between'}>
          <FillRowTabs<'model' | 'channel'>
            list={[
              { label: t('account:active_model'), value: 'model' },
              { label: t('account:channel'), value: 'channel' }
            ]}
            value={tab}
            px={8}
            py={1}
            onChange={setTab}
          />

          {tab === 'model' && (
            <MyMenu
              trigger="hover"
              size="mini"
              Button={<Button>{t('account:create_model')}</Button>}
              menuList={[
                {
                  children: [
                    {
                      label: t('account:default_model'),
                      onClick: onOpenDefault
                    },
                    {
                      label: t('account:custom_model')
                    }
                  ]
                }
              ]}
            />
          )}
          {tab === 'channel' && <Button>{t('account:create_channel')}</Button>}
        </Flex> */}
        <Box flex={'1 0 0'}>
          {tab === 'model' && <ModelTable />}
          {/* {tab === 'channel' && <ChannelTable />} */}
        </Box>
      </Flex>

      {isOpenDefault && <DefaultModal onClose={onCloseDefault} />}
    </AccountContainer>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['account']))
    }
  };
}

export default ModelProvider;
