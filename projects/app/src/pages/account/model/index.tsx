import { useCallback, useEffect, useMemo } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import AccountContainer from '@/pageComponents/account/AccountContainer';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import { accountPageRootStyles, accountTitleTextStyles } from '@/pageComponents/account/styles';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useToast } from '@fastgpt/web/hooks/useToast';
import ModelTable from '@/components/core/ai/ModelTable';
import ModelManagementContainer, {
  type ModelTabType
} from '@/pageComponents/model/ModelManagementContainer';

const ModelProvider = () => {
  const { t } = useClientTranslation(['config_model', 'config']);
  const { feConfigs, initd } = useSystemStore();
  const { userInfo } = useUserStore();
  const { toast } = useToast();
  const router = useRouter();

  const isRoot = userInfo?.username === 'root';
  const canManageModel = Boolean(isRoot || userInfo?.team?.permission?.hasModelCreatePer);

  const modelTabList = useMemo<{ label: string; value: ModelTabType }[]>(
    () => [
      { label: t('config_model:active_model'), value: 'active_model' },
      { label: t('config_model:config_model'), value: 'config' },
      { label: t('config_model:channel'), value: 'channel' },
      { label: t('config_model:log'), value: 'channel_log' },
      { label: t('config_model:monitoring'), value: 'account_model' }
    ],
    [t]
  );

  const handleBeforeTabChange = useCallback(
    (targetTab: ModelTabType, options?: { silent?: boolean }) => {
      if (!canManageModel && targetTab !== 'active_model') {
        if (!options?.silent) {
          toast({
            status: 'warning',
            title: t('common:error_un_permission')
          });
        }
        return false;
      }
      return true;
    },
    [canManageModel, t, toast]
  );

  useEffect(() => {
    if (!router.isReady) return;
    if (!canManageModel && router.query.modelTab && router.query.modelTab !== 'active_model') {
      toast({
        status: 'warning',
        title: t('common:error_un_permission')
      });
      void router.replace(
        {
          pathname: router.pathname,
          query: {
            ...router.query,
            modelTab: 'active_model'
          }
        },
        undefined,
        { shallow: true }
      );
    }
  }, [canManageModel, router, t, toast]);

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
        <Flex
          flex={'1 0 0'}
          minH={['calc(100dvh - 78px)', 0]}
          flexDirection={'column'}
          gap={4}
          py={6}
          pt={[4, 6]}
        >
          <ModelManagementContainer
            channelType="team"
            scrollPositionKey="account-model-tabs"
            defaultTab="active_model"
            customTabs={modelTabList}
            onBeforeTabChange={handleBeforeTabChange}
            renderCustomTab={(tab, TabNode) =>
              tab === 'active_model' ? (
                <ModelTable permissionConfig contentPx={6} Tab={TabNode} />
              ) : null
            }
          />
        </Flex>
      </Flex>
    </AccountContainer>
  );
};

export default ModelProvider;
