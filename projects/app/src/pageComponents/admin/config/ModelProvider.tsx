import React, { useMemo } from 'react';
import { Flex } from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { accountPageRootStyles } from '@/pageComponents/account/styles';
import ModelManagementContainer, {
  type ModelTabType
} from '@/pageComponents/model/ModelManagementContainer';

const ModelStatus = dynamic(() => import('@/pageComponents/model/ModelStatus'));

const ModelProvider = () => {
  const { t } = useSafeTranslation();

  const customTabs = useMemo<{ label: string; value: ModelTabType }[]>(
    () => [
      { label: t('config_model:config_model'), value: 'config' },
      { label: t('config_model:channel'), value: 'channel' },
      { label: t('config_model:log'), value: 'channel_log' },
      { label: t('config_model:monitoring'), value: 'account_model' },
      { label: t('config_model:model_status'), value: 'status' }
    ],
    [t]
  );

  return (
    <AdminContainer>
      <Flex {...accountPageRootStyles} bg={'white'} flexDirection={'column'}>
        <Flex
          flex={'1 0 0'}
          minH={['calc(100dvh - 78px)', 0]}
          flexDirection={'column'}
          gap={4}
          py={6}
          pt={[4, 6]}
        >
          <ModelManagementContainer
            channelType="system"
            scrollPositionKey="config-model-tabs"
            defaultTab="config"
            customTabs={customTabs}
            renderCustomTab={(tab, TabNode) =>
              tab === 'status' ? <ModelStatus Tab={TabNode} /> : null
            }
          />
        </Flex>
      </Flex>
    </AdminContainer>
  );
};

export default ModelProvider;
