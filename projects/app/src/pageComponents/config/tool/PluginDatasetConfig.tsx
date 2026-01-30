'use client';

import { Box, Flex, Grid, Switch } from '@chakra-ui/react';
import MyBox from '@fastgpt/web/components/common/MyBox';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useTranslation } from 'next-i18next';
import { usePluginStore } from '@/web/core/plugin/store/plugin';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { updatePluginDatasetStatus } from '@/web/core/plugin/admin/dataset/api';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';

const PluginDatasetConfig = () => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'zh-CN';

  const { pluginDatasets, updatePluginDatasetStatus: updateStoreStatus } = usePluginStore();

  const { runAsync: updateStatus, loading } = useRequest2(updatePluginDatasetStatus, {
    successToast: t('common:save_success'),
    errorToast: t('common:save_failed'),
    onSuccess: updateStoreStatus
  });

  return (
    <MyBox isLoading={loading}>
      <Box bg={'white'} rounded={'md'} p={6}>
        <Grid gridTemplateColumns={['1fr', '1fr 1fr']} gap={6}>
          {pluginDatasets.map((item) => {
            const title = parseI18nString(item.name, lang);
            const description = parseI18nString(item.description, lang);

            return (
              <Flex
                key={item.sourceId}
                p={4}
                border={'1px solid'}
                borderColor={'myGray.200'}
                rounded={'md'}
                alignItems={'center'}
                _hover={{ borderColor: 'primary.300' }}
              >
                <Avatar src={item.icon} w={'24px'} mr={3} borderRadius={'md'} />
                <Box flex={1}>
                  <Box fontWeight={'medium'} color={'myGray.900'}>
                    {title}
                  </Box>
                  {description && (
                    <Box fontSize={'xs'} color={'myGray.500'} mt={1}>
                      {description}
                    </Box>
                  )}
                </Box>
                <Switch
                  isChecked={!!item.status}
                  onChange={(e) =>
                    updateStatus({ sourceId: item.sourceId, status: e.target.checked ? 1 : 0 })
                  }
                  size={'sm'}
                />
              </Flex>
            );
          })}
        </Grid>
      </Box>
    </MyBox>
  );
};

export default PluginDatasetConfig;
