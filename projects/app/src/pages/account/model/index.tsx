import { Box, Flex } from '@chakra-ui/react';
import AccountContainer from '@/pageComponents/account/AccountContainer';
import ModelTable from '@/components/core/ai/ModelTable';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import { accountPageRootStyles, accountTitleTextStyles } from '@/pageComponents/account/styles';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

const ModelProvider = () => {
  const { t } = useClientTranslation();
  const { feConfigs, initd } = useSystemStore();
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady || !initd || feConfigs.isPlus) return;
    void router.replace('/account/info');
  }, [feConfigs.isPlus, initd, router]);

  if (!initd || !feConfigs.isPlus) {
    return <AccountContainer isLoading>{null}</AccountContainer>;
  }

  return (
    <AccountContainer>
      <Flex {...accountPageRootStyles} flexDirection={'column'}>
        <Flex
          display={['none', 'flex']}
          h={'64px'}
          flexShrink={0}
          px={6}
          alignItems={'center'}
          borderBottom={'1px solid'}
          borderColor={'myGray.200'}
        >
          <Box as={'h1'} {...accountTitleTextStyles}>
            {t('common:model.provider_title')}
          </Box>
        </Flex>
        <Box flex={['0 0 auto', '1 0 0']} minH={0} py={6}>
          <ModelTable permissionConfig contentPx={6} />
        </Box>
      </Flex>
    </AccountContainer>
  );
};

export default ModelProvider;
