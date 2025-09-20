'use client';
import UploadSystemToolModal from '@/pageComponents/app/plugin/UploadSystemToolModal';
import DashboardContainer from '@/pageComponents/dashboard/Container';
import PluginCard from '@/pageComponents/dashboard/SystemPlugin/ToolCard';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { getSystemPlugTemplates, postDeletePlugin } from '@/web/core/app/api/plugin';
import { useUserStore } from '@/web/support/user/useUserStore';
import { Box, Button, Flex, Grid, useDisclosure } from '@chakra-ui/react';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { useMemo, useState } from 'react';

const SystemTools = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const { type, pluginGroupId } = router.query as { type?: string; pluginGroupId?: string };
  const { isPc } = useSystem();
  const { userInfo } = useUserStore();

  const isRoot = userInfo?.username === 'root';

  const [searchKey, setSearchKey] = useState('');
  const [deletingPlugins, setDeletingPlugins] = useState<Set<string>>(new Set());

  const {
    data: plugins = [],
    loading: isLoading,
    runAsync: refreshPlugins
  } = useRequest2(getSystemPlugTemplates, {
    manual: false
  });
  const {
    isOpen: isOpenUploadPlugin,
    onOpen: onOpenUploadPlugin,
    onClose: onCloseUploadPlugin
  } = useDisclosure();

  const handlePluginDelete = async (pluginId: string) => {
    setDeletingPlugins((prev) => new Set(prev).add(pluginId));

    try {
      await postDeletePlugin(pluginId);
      toast({
        title: t('common:delete_success'),
        status: 'success'
      });

      // null means all tools
      await refreshPlugins({ parentId: null });
    } catch (error) {
      Promise.reject(error);
      toast({
        title: t('common:delete_failed'),
        status: 'error'
      });
    } finally {
      setDeletingPlugins((prev) => {
        const newSet = new Set(prev);
        newSet.delete(pluginId);
        return newSet;
      });
    }
  };

  const currentPlugins = useMemo(() => {
    return plugins
      .filter((plugin) => {
        if (!type || type === 'all') return true;
        return plugin.templateType === type;
      })
      .filter((item) => {
        if (!searchKey) return true;
        const regex = new RegExp(searchKey, 'i');
        return regex.test(`${item.name}${item.intro}${item.instructions}`);
      });
  }, [plugins, searchKey, type]);

  return (
    <DashboardContainer>
      {({ pluginGroups, MenuIcon }) => {
        const currentGroup = pluginGroups.find((group) => group.groupId === pluginGroupId);
        const groupTemplateTypeIds =
          currentGroup?.groupTypes
            ?.map((type) => type.typeId)
            .reduce(
              (acc, cur) => {
                acc[cur] = true;
                return acc;
              },
              {} as Record<string, boolean>
            ) || {};
        const filterPluginsByGroup = currentPlugins.filter((plugin) => {
          if (!currentGroup) return true;
          return groupTemplateTypeIds[plugin.templateType];
        });

        return (
          <>
            <MyBox isLoading={isLoading} h={'100%'}>
              <Box p={6} h={'100%'} overflowY={'auto'}>
                <Flex alignItems={'center'} justifyContent={'space-between'}>
                  {isPc ? (
                    <Box fontSize={'lg'} color={'myGray.900'} fontWeight={500}>
                      {t('app:core.module.template.System Tools')}
                    </Box>
                  ) : (
                    MenuIcon
                  )}
                  <Flex alignItems={'center'} gap={4}>
                    <Box flex={'0 0 200px'}>
                      <SearchInput
                        value={searchKey}
                        onChange={(e) => setSearchKey(e.target.value)}
                        placeholder={t('common:plugin.Search plugin')}
                      />
                    </Box>
                    {isRoot && (
                      <Button onClick={onOpenUploadPlugin}>{t('file:common:import_update')}</Button>
                    )}
                  </Flex>
                </Flex>
                <Grid
                  gridTemplateColumns={[
                    '1fr',
                    'repeat(2,1fr)',
                    'repeat(2,1fr)',
                    'repeat(3,1fr)',
                    'repeat(4,1fr)'
                  ]}
                  gridGap={4}
                  alignItems={'stretch'}
                  py={5}
                >
                  {filterPluginsByGroup.map((item) => (
                    <PluginCard
                      key={item.id}
                      item={item}
                      groups={pluginGroups}
                      onDelete={isRoot ? handlePluginDelete : undefined}
                    />
                  ))}
                </Grid>
                {filterPluginsByGroup.length === 0 && <EmptyTip />}
              </Box>
            </MyBox>
            {isOpenUploadPlugin && (
              <UploadSystemToolModal
                onClose={onCloseUploadPlugin}
                onSuccess={() => refreshPlugins({ parentId: null })}
              />
            )}
          </>
        );
      }}
    </DashboardContainer>
  );
};

export default SystemTools;

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['app', 'file']))
    }
  };
}
