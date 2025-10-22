import { Box, Button, Flex, HStack } from '@chakra-ui/react';
import Avatar from '../../common/Avatar';
import MyBox from '../../common/MyBox';
import React, { useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import type { SystemPluginTemplateListItemType } from '@fastgpt/global/core/app/plugin/type';
import MyIcon from '../../common/Icon';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';

type ToolCardProps = {
  item: SystemPluginTemplateListItemType;
  isInstalled: boolean | null;
  onToggleInstall: (installed: boolean) => void;
  systemTitle?: string;
};

const ToolCard = ({ item, isInstalled, onToggleInstall, systemTitle }: ToolCardProps) => {
  const { t, i18n } = useTranslation();

  const currentStatus = useMemo(() => {
    const statusMap: Record<
      number | string,
      { label: string; color: string; icon?: string } | null
    > = {
      0: {
        label: t('app:toolkit_status_offline'),
        color: 'red.600'
      },
      2: {
        label: t('app:toolkit_status_soon_offline'),
        color: 'yellow.600'
      },
      installed: {
        label: t('app:toolkit_installed'),
        color: 'myGray.900',
        icon: 'common/check'
      }
    };

    if (item.status === 0) return statusMap[0];
    if (item.status === 2) return statusMap[2];
    if (isInstalled) return statusMap.installed;
    return null;
  }, [item.status, isInstalled, t]);

  return (
    <MyBox
      key={item.id}
      lineHeight={1.5}
      h="100%"
      pt={4}
      pb={3}
      px={4}
      border={'base'}
      bg={'white'}
      borderRadius={'10px'}
      position={'relative'}
      display={'flex'}
      flexDirection={'column'}
      _hover={{
        boxShadow: '0 4px 4px 0 rgba(19, 51, 107, 0.05), 0 0 1px 0 rgba(19, 51, 107, 0.08);',
        '& .install-button': {
          display: 'block'
        }
      }}
    >
      <HStack>
        <Avatar src={item.avatar} borderRadius={'sm'} w={'1.5rem'} h={'1.5rem'} />
        <Box color={'myGray.900'} fontWeight={500}>
          {parseI18nString(item.name, i18n.language)}
        </Box>
        {currentStatus &&
          (currentStatus.icon ? (
            <Flex fontSize={'12px'} fontWeight={'medium'} color={currentStatus.color} mr={1}>
              <MyIcon name={currentStatus.icon as any} w={4} />
              {currentStatus.label}
            </Flex>
          ) : (
            <Box fontSize={'12px'} fontWeight={'medium'} color={currentStatus.color}>
              {currentStatus.label}
            </Box>
          ))}
      </HStack>
      <Box
        flex={['1 0 48px', '1 0 56px']}
        mt={3}
        pr={1}
        textAlign={'justify'}
        wordBreak={'break-all'}
        fontSize={'xs'}
        color={'myGray.500'}
      >
        <Box className={'textEllipsis2'}>
          {parseI18nString(item.intro || '', i18n.language) || t('app:templateMarket.no_intro')}
        </Box>
      </Box>
      <Flex gap={1}>
        {item.tags?.map((tag) => {
          return (
            <Box
              key={tag.tagId}
              px={2}
              py={1}
              border={'1px solid'}
              borderRadius={'6px'}
              borderColor={'myGray.200'}
              fontSize={'11px'}
              fontWeight={'medium'}
              color={'myGray.700'}
            >
              {parseI18nString(tag.tagName, i18n.language)}
            </Box>
          );
        })}
      </Flex>

      <Flex w={'full'} fontSize={'mini'} alignItems={'end'} justifyContent={'space-between'}>
        <Box color={'myGray.500'} mt={3}>{`by ${item.author || systemTitle || 'FastGPT'}`}</Box>
        {isInstalled ? (
          <Button
            className="install-button"
            display={'none'}
            size={'sm'}
            variant={'primaryOutline'}
            onClick={(e) => {
              e.stopPropagation();
              onToggleInstall(false);
            }}
          >
            {t('app:toolkit_uninstall')}
          </Button>
        ) : (
          <Button
            className="install-button"
            display={'none'}
            size={'sm'}
            onClick={(e) => {
              e.stopPropagation();
              onToggleInstall(true);
            }}
          >
            {t('app:toolkit_install')}
          </Button>
        )}
      </Flex>
    </MyBox>
  );
};

export default React.memo(ToolCard);
