import { serviceSideProps } from '@/web/common/utils/i18n';
import { getSystemPluginGroups, getSystemPlugTemplates } from '@/web/core/app/api/plugin';
import { Box, Flex, Grid, Input, InputGroup, InputLeftElement } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useMemo, useState } from 'react';
import PluginCard from './components/PluginCard';
import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { i18nT } from '@fastgpt/web/i18n/utils';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/router';
import MyIcon from '@fastgpt/web/components/common/Icon';

export const defaultGroup = {
  groupId: 'systemPlugin',
  groupAvatar: 'common/navbar/pluginLight',
  groupName: i18nT('common:core.module.template.System Plugin'),
  groupTypes: [
    {
      typeId: FlowNodeTemplateTypeEnum.tools as string,
      typeName: i18nT('common:navbar.Tools')
    },
    {
      typeId: FlowNodeTemplateTypeEnum.search as string,
      typeName: i18nT('common:common.Search')
    },
    {
      typeId: FlowNodeTemplateTypeEnum.multimodal as string,
      typeName: i18nT('common:core.workflow.template.Multimodal')
    },
    {
      typeId: FlowNodeTemplateTypeEnum.communication as string,
      typeName: i18nT('app:workflow.template.communication')
    },
    {
      typeId: FlowNodeTemplateTypeEnum.other as string,
      typeName: i18nT('common:common.Other')
    }
  ]
};

const Store = () => {
  const router = useRouter();
  const { group: selectedGroup = defaultGroup.groupName, type: selectedType = 'all' } =
    router.query;

  const { data: plugins = [] } = useRequest2(getSystemPlugTemplates, {
    manual: false
  });

  const { data: pluginGroups = [] } = useRequest2(getSystemPluginGroups, {
    manual: false
  });

  const [search, setSearch] = useState('');

  const allGroups = useMemo(() => {
    return [defaultGroup, ...pluginGroups].filter((group) => {
      const groupTypes = group.groupTypes.filter((type) =>
        plugins.find((plugin) => plugin.templateType === type.typeId)
      );
      return groupTypes.length > 0;
    });
  }, [pluginGroups, plugins]);

  const { t } = useTranslation();

  const currentPluginGroupTypes = useMemo(() => {
    const currentTypes = allGroups?.find((group) => group.groupName === selectedGroup)?.groupTypes;

    return currentTypes?.filter((type) =>
      plugins.find((plugin) => plugin.templateType === type.typeId)
    );
  }, [allGroups, plugins, selectedGroup]);

  const currentPlugins = useMemo(() => {
    const typeArray = currentPluginGroupTypes?.map((type) => type.typeId);
    return plugins
      .filter(
        (plugin) =>
          (selectedType === 'all' && typeArray?.includes(plugin.templateType)) ||
          selectedType === plugin.templateType
      )
      .filter(
        (plugin) =>
          plugin.name.includes(search) ||
          plugin.intro?.includes(search) ||
          plugin.instructions?.includes(search)
      );
  }, [currentPluginGroupTypes, plugins, selectedType, search]);

  return (
    <Flex flexDirection={'column'} h={'100%'}>
      <Box pl={3} pr={8}>
        <Flex alignItems={'center'} mt={6} ml={2} mb={2}>
          <Flex flex={1}>
            {allGroups?.map((group) => {
              const selected = group.groupName === selectedGroup;
              return (
                <Flex
                  key={group.groupName}
                  rounded={'md'}
                  bg={selected ? 'white' : ''}
                  color={selected ? 'primary.700' : ''}
                  boxShadow={
                    selected
                      ? '0px 4px 4px 0px rgba(19, 51, 107, 0.05), 0px 0px 1px 0px rgba(19, 51, 107, 0.08)'
                      : ''
                  }
                  px={3}
                  py={2}
                  mr={3}
                  fontSize={'16px'}
                  fontWeight={'medium'}
                  cursor={'pointer'}
                  onClick={() =>
                    router.push({
                      pathname: router.pathname,
                      query: { group: group.groupName, type: 'all' }
                    })
                  }
                  _hover={{ bg: 'white' }}
                >
                  <Avatar src={group.groupAvatar} w={'24px'} mr={1} />
                  {t(group.groupName as any)}
                </Flex>
              );
            })}
          </Flex>
          <InputGroup w={'200px'}>
            <InputLeftElement alignItems={'center'}>
              <MyIcon name="common/searchLight" w={'18px'} mt={1.5} />
            </InputLeftElement>
            <Input
              mt={1.5}
              placeholder={t('common:plugin.Search plugin')}
              bg={'white'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </InputGroup>
        </Flex>
        <Flex flex={1}>
          <LightRowTabs
            list={[
              {
                label: t('common:common.All'),
                value: 'all'
              },
              ...(currentPluginGroupTypes?.map((type) => ({
                label: type.typeName,
                value: type.typeId
              })) || [])
            ]}
            value={selectedType as string}
            onChange={(e) => {
              router.push({
                pathname: router.pathname,
                query: { ...router.query, type: e }
              });
            }}
            mb={4}
            gap={4}
            fontSize={'16px'}
            fontWeight={'medium'}
          />
        </Flex>
        <Grid
          gridTemplateColumns={[
            '1fr',
            'repeat(2,1fr)',
            'repeat(3,1fr)',
            'repeat(3,1fr)',
            'repeat(4,1fr)'
          ]}
          gridGap={4}
          alignItems={'stretch'}
          pb={5}
        >
          {currentPlugins.map((item) => (
            <PluginCard key={item.id} item={item} groups={allGroups} />
          ))}
        </Grid>
      </Box>
    </Flex>
  );
};

export default Store;

export async function getServerSideProps(context: any) {
  return {
    props: {
      ...(await serviceSideProps(context, ['app', 'user']))
    }
  };
}
