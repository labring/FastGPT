import DashboardContainer from '@/pageComponents/dashboard/Container';

import PluginCard from '@/pageComponents/dashboard/SystemPlugin/ToolCard';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { getSystemPlugTemplates } from '@/web/core/app/api/plugin';
import { Box, Flex, Grid } from '@chakra-ui/react';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useRouter } from 'next/router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';
import MyBox from '@fastgpt/web/components/common/MyBox';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useSystem } from '@fastgpt/web/hooks/useSystem';

const SystemTools = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { type, pluginGroupId } = router.query as { type?: string; pluginGroupId?: string };
  const { isPc } = useSystem();

  const [searchKey, setSearchKey] = useState('');

  const { data: plugins = [], loading: isLoading } = useRequest2(getSystemPlugTemplates, {
    manual: false
  });

  const currentPlugins = useMemo(() => {
    return plugins
      .filter((plugin) => {
        if (!type || type === 'all') return true;
        return plugin.templateType === type;
      })
      .filter((item) => {
        if (!searchKey) return true;
        const regx = new RegExp(searchKey, 'i');
        return regx.test(`${item.name}${item.intro}${item.instructions}`);
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
          <MyBox isLoading={isLoading} h={'100%'}>
            <Box p={6} h={'100%'} overflowY={'auto'}>
              <Flex alignItems={'center'} justifyContent={'space-between'}>
                {isPc ? (
                  <Box fontSize={'lg'} color={'myGray.900'} fontWeight={500}>
                    {t('common:core.module.template.System Plugin')}
                  </Box>
                ) : (
                  MenuIcon
                )}

                <Box flex={'0 0 200px'}>
                  <SearchInput
                    value={searchKey}
                    onChange={(e) => setSearchKey(e.target.value)}
                    placeholder={t('common:plugin.Search plugin')}
                  />
                </Box>
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
                  <PluginCard key={item.id} item={item} groups={pluginGroups} />
                ))}
              </Grid>
              {filterPluginsByGroup.length === 0 && <EmptyTip />}
            </Box>
          </MyBox>
        );
      }}
    </DashboardContainer>
  );
};

export default SystemTools;

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['app']))
    }
  };
}
