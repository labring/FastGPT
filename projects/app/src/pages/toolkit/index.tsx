import { serviceSideProps } from '@/web/common/utils/i18n';
import { getSystemPluginGroups, getSystemPlugTemplates } from '@/web/core/app/api/plugin';
import {
  Box,
  Flex,
  Grid,
  Input,
  InputGroup,
  InputLeftElement,
  useDisclosure
} from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useMemo, useState } from 'react';
import PluginCard from './components/PluginCard';
import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { i18nT } from '@fastgpt/web/i18n/utils';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/router';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSystem } from '@fastgpt/web/hooks/useSystem';

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

export const allTypes = [
  {
    typeId: 'all',
    typeName: i18nT('common:common.All')
  }
];

const Toolkit = () => {
  const router = useRouter();
  const { isPc } = useSystem();

  const { group: selectedGroup = defaultGroup.groupName, type: selectedType = 'all' } =
    router.query;

  const { data: plugins = [] } = useRequest2(getSystemPlugTemplates, {
    manual: false
  });

  const { data: pluginGroups = [] } = useRequest2(getSystemPluginGroups, {
    manual: false
  });

  const [search, setSearch] = useState('');

  const { isOpen, onOpen, onClose } = useDisclosure();

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
    <Flex flexDirection={'column'} h={'100%'} overflow={'auto'}>
      {!isPc && isOpen && (
        <Box
          position="fixed"
          top={0}
          left={0}
          right={0}
          bottom={0}
          bg="blackAlpha.600"
          onClick={onClose}
          zIndex={999}
        />
      )}
      {(isPc || isOpen) && (
        <Box
          position={'fixed'}
          left={isPc ? 16 : 0}
          top={0}
          bg={'myGray.25'}
          w={'200px'}
          h={'full'}
          borderLeft={'1px solid'}
          borderRight={'1px solid'}
          borderColor={'myGray.200'}
          pt={4}
          px={2.5}
          pb={2.5}
          zIndex={1000}
        >
          {allGroups?.map((group) => {
            const selected = group.groupName === selectedGroup;
            console.log(currentPluginGroupTypes);
            return (
              <Box key={group.groupName}>
                <Flex
                  p={2}
                  mb={0.5}
                  fontSize={'14px'}
                  fontWeight={'medium'}
                  cursor={'pointer'}
                  rounded={'md'}
                  color={'myGray.900'}
                  _hover={{ bg: 'primary.50', color: 'primary.600' }}
                  onClick={() =>
                    router.push({
                      pathname: router.pathname,
                      query: { group: group.groupName, type: 'all' }
                    })
                  }
                >
                  <Avatar src={group.groupAvatar} w={'16px'} mr={1.5} color={'primary.600'} />
                  {t(group.groupName as any)}
                  <Box flex={1} />
                  <MyIcon
                    color={'myGray.600'}
                    name={selected ? 'core/chat/chevronDown' : 'core/chat/chevronUp'}
                    w={'16px'}
                  />
                </Flex>
                {selected &&
                  [...allTypes, ...(currentPluginGroupTypes || [])]?.map((type) => {
                    const selected = type.typeId === selectedType;
                    return (
                      <Flex
                        key={type.typeId}
                        fontSize={'14px'}
                        fontWeight={500}
                        rounded={'md'}
                        py={2}
                        pl={'30px'}
                        cursor={'pointer'}
                        mb={0.5}
                        _hover={{ bg: 'primary.50', color: 'primary.600' }}
                        bg={selected ? 'primary.50' : 'transparent'}
                        color={selected ? 'primary.600' : 'myGray.500'}
                        onClick={() => {
                          router.push({
                            pathname: router.pathname,
                            query: { ...router.query, type: type.typeId }
                          });
                        }}
                      >
                        {t(type.typeName as any)}
                      </Flex>
                    );
                  })}
              </Box>
            );
          })}
        </Box>
      )}
      <Box ml={isPc ? '200px' : 0} p={6}>
        <Flex alignItems={'center'}>
          <Flex flex={1} fontSize={'xl'} fontWeight={'medium'} color={'myGray.900'}>
            {!isPc && <MyIcon name="menu" w={'20px'} mr={1.5} onClick={onOpen} />}
            {t(selectedGroup as any)}
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
          py={5}
        >
          {currentPlugins.map((item) => (
            <PluginCard key={item.id} item={item} groups={allGroups} />
          ))}
        </Grid>
      </Box>
    </Flex>
  );
};

export default Toolkit;

export async function getServerSideProps(context: any) {
  return {
    props: {
      ...(await serviceSideProps(context, ['app', 'user']))
    }
  };
}
