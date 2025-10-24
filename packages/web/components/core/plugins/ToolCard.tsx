import { Box, Button, Flex, HStack } from '@chakra-ui/react';
import Avatar from '../../common/Avatar';
import MyBox from '../../common/MyBox';
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import type { SystemPluginTemplateListItemType } from '@fastgpt/global/core/app/plugin/type';
import MyIcon from '../../common/Icon';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';

const ToolCard = ({
  item,
  isInstalled,
  onToggleInstall,
  systemTitle,
  onClick
}: {
  item: SystemPluginTemplateListItemType;
  isInstalled: boolean | null;
  onToggleInstall: (installed: boolean) => void;
  systemTitle?: string;
  onClick?: () => void;
}) => {
  const { t, i18n } = useTranslation();
  const tagsContainerRef = useRef<HTMLDivElement>(null);
  const [visibleTagsCount, setVisibleTagsCount] = useState(item.tags?.length || 0);

  useEffect(() => {
    const calculate = () => {
      const container = tagsContainerRef.current;
      if (!container || !item.tags?.length) return;

      const containerWidth = container.offsetWidth;
      const tagElements = container.querySelectorAll('[data-tag-item]');
      if (!containerWidth || !tagElements.length) return;

      let totalWidth = 0;
      let count = 0;

      for (let i = 0; i < tagElements.length; i++) {
        const width = totalWidth + (tagElements[i] as HTMLElement).offsetWidth + (i > 0 ? 4 : 0);
        if (width + (i < tagElements.length - 1 ? 54 : 0) > containerWidth) break;
        totalWidth = width;
        count++;
      }

      setVisibleTagsCount(Math.max(1, count));
    };

    const timer = setTimeout(calculate, 0);
    const observer = new ResizeObserver(calculate);
    if (tagsContainerRef.current) observer.observe(tagsContainerRef.current);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [item.tags]);

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
      p={4}
      pb={3}
      border={'base'}
      bg={'white'}
      borderRadius={'10px'}
      display={'flex'}
      flexDirection={'column'}
      cursor={onClick ? 'pointer' : 'default'}
      onClick={onClick}
      _hover={{
        boxShadow: '0 4px 4px 0 rgba(19, 51, 107, 0.05), 0 0 1px 0 rgba(19, 51, 107, 0.08);',
        '& .install-button': {
          display: 'block'
        }
      }}
    >
      <HStack>
        <Avatar src={item.avatar} borderRadius={'sm'} w={'1.5rem'} />
        <Box color={'myGray.900'} fontWeight={'medium'}>
          {parseI18nString(item.name, i18n.language)}
        </Box>
        {currentStatus && (
          <Flex fontSize={'12px'} fontWeight={'medium'} color={currentStatus.color}>
            {currentStatus.icon && <MyIcon name={currentStatus.icon as any} w={4} />}
            {currentStatus.label}
          </Flex>
        )}
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
      <Flex gap={1} overflow={'hidden'} ref={tagsContainerRef}>
        {item.tags?.slice(0, visibleTagsCount).map((tag) => {
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
              flexShrink={0}
              data-tag-item
            >
              {parseI18nString(tag.tagName, i18n.language)}
            </Box>
          );
        })}
        {item.tags && item.tags.length > visibleTagsCount && (
          <Box
            px={2}
            py={1}
            border={'1px solid'}
            borderRadius={'6px'}
            borderColor={'myGray.200'}
            fontSize={'11px'}
            fontWeight={'medium'}
            color={'myGray.700'}
            flexShrink={0}
          >
            +{item.tags.length - visibleTagsCount}
          </Box>
        )}
      </Flex>

      <Flex w={'full'} fontSize={'mini'} alignItems={'end'} justifyContent={'space-between'}>
        <Box color={'myGray.500'} mt={3}>{`by ${item.author || systemTitle || 'FastGPT'}`}</Box>
        <Button
          className="install-button"
          display={'none'}
          size={'sm'}
          variant={isInstalled ? 'primaryOutline' : 'primary'}
          onClick={(e) => {
            e.stopPropagation();
            onToggleInstall(!isInstalled);
          }}
        >
          {isInstalled ? t('app:toolkit_uninstall') : t('app:toolkit_install')}
        </Button>
      </Flex>
    </MyBox>
  );
};

export default React.memo(ToolCard);
