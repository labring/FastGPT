import { serviceSideProps } from '@/web/common/utils/i18n';
import { getPluginGroups, getSystemPlugTemplates } from '@/web/core/app/api/plugin';
import { Box, Flex, Grid, useDisclosure } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useMemo, useState } from 'react';
import PluginCard from './components/PluginCard';
import { i18nT } from '@fastgpt/web/i18n/utils';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import { navbarWidth } from '@/components/Layout';

const Toolkit = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { isPc } = useSystem();

  const { data: plugins = [] } = useRequest2(getSystemPlugTemplates, {
    manual: false
  });
  const { data: pluginGroups = [] } = useRequest2(getPluginGroups, {
    manual: false
  });
  const isOneGroup = pluginGroups.length === 1;

  const [search, setSearch] = useState('');
  const { isOpen, onOpen, onClose } = useDisclosure();

  const { group: selectedGroup = pluginGroups?.[0]?.groupId, type: selectedType = 'all' } =
    router.query;

  const pluginGroupTypes = useMemo(() => {
    const allTypes = [
      {
        typeId: 'all',
        typeName: i18nT('common:common.All')
      }
    ];
    const currentTypes =
      pluginGroups?.find((group) => group.groupId === selectedGroup)?.groupTypes ?? [];

    return [
      ...allTypes,
      ...currentTypes.filter((type) =>
        plugins.find((plugin) => plugin.templateType === type.typeId)
      )
    ];
  }, [pluginGroups, plugins, selectedGroup]);

  const currentPlugins = useMemo(() => {
    const typeArray = pluginGroupTypes?.map((type) => type.typeId);
    return plugins
      .filter(
        (plugin) =>
          (selectedType === 'all' && typeArray?.includes(plugin.templateType)) ||
          selectedType === plugin.templateType
      )
      .filter((plugin) => {
        const str = `${plugin.name}${plugin.intro}${plugin.instructions}`;
        const regx = new RegExp(search, 'gi');
        return regx.test(str);
      });
  }, [pluginGroupTypes, plugins, selectedType, search]);

  return (
    <Flex flexDirection={'column'} h={'100%'} overflow={'auto'}>
      {/* Mask */}
      {!isPc && isOpen && (
        <Box
          position="fixed"
          top={0}
          left={0}
          right={0}
          bottom={0}
          bg="blackAlpha.600"
          onClick={onClose}
          zIndex={99}
        />
      )}
      {/* Sidebar */}
      {(isPc || isOpen) && (
        <Box
          position={'fixed'}
          left={isPc ? navbarWidth : 0}
          top={0}
          bg={'myGray.25'}
          w={['60vw', '200px']}
          h={'full'}
          borderLeft={'1px solid'}
          borderRight={'1px solid'}
          borderColor={'myGray.200'}
          pt={4}
          px={2.5}
          pb={2.5}
          zIndex={100}
          userSelect={'none'}
        >
          {pluginGroups.map((group) => {
            const selected = group.groupId === selectedGroup;
            return (
              <Box key={group.groupId}>
                <Flex
                  p={2}
                  mb={0.5}
                  fontSize={'sm'}
                  rounded={'md'}
                  color={'myGray.900'}
                  {...(!isOneGroup && {
                    cursor: 'pointer',
                    _hover: {
                      bg: 'primary.50'
                    },
                    onClick: () => {
                      router.push({
                        query: { group: group.groupId, type: 'all' }
                      });
                      onClose();
                    }
                  })}
                >
                  <Avatar src={group.groupAvatar} w={'1rem'} mr={1.5} color={'primary.600'} />
                  <Box>{t(group.groupName as any)}</Box>
                  <Box flex={1} />
                  {!isOneGroup && (
                    <MyIcon
                      color={'myGray.600'}
                      name={selected ? 'core/chat/chevronDown' : 'core/chat/chevronUp'}
                      w={'1rem'}
                    />
                  )}
                </Flex>
                {/* group types */}
                {selected &&
                  pluginGroupTypes.map((type) => {
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
                        _hover={{ bg: 'primary.50' }}
                        {...(type.typeId === selectedType
                          ? {
                              bg: 'primary.50',
                              color: 'primary.600'
                            }
                          : {
                              bg: 'transparent',
                              color: 'myGray.500'
                            })}
                        onClick={() => {
                          router.push({
                            query: { group: selectedGroup, type: type.typeId }
                          });
                          onClose();
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
      <Box ml={[0, '200px']} p={[5, 6]}>
        <Flex alignItems={'center'}>
          <Flex flex={1} fontSize={'xl'} fontWeight={'medium'} color={'myGray.900'}>
            {isPc ? (
              <Box>
                {t(
                  pluginGroups?.find((group) => group.groupId === selectedGroup)?.groupName as any
                )}
              </Box>
            ) : (
              <MyIcon name="menu" w={'20px'} mr={1.5} onClick={onOpen} />
            )}
          </Flex>
          <Box w={['60vw', '260px']}>
            <SearchInput
              value={search}
              bg={'white'}
              onChange={(e) => setSearch(e.target.value)}
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
          {currentPlugins.map((item) => (
            <PluginCard key={item.id} item={item} groups={pluginGroups} />
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
