import { Box, Button, Flex, HStack } from '@chakra-ui/react';
import Avatar from '../../../common/Avatar';
import MyBox from '../../../common/MyBox';
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import MyIcon from '../../../common/Icon';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';

/* 
  3 种使用场景：
  1. admin 视角插件市场：显示是否安装，无状态，显示安装/卸载
  2. team 视角资源库：显示是否安装，状态文本，以及安装/卸载
  3. 开放的插件市场：不显示任何状态，只显示下载按钮
*/
export type ToolCardItemType = {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  author?: string;
  tags?: string[] | null;
  downloadUrl?: string;
  status?: number;
  installed?: boolean;
};

const ToolCard = ({
  item,
  systemTitle,
  isLoading,
  mode,
  onClickButton,
  onClickCard
}: {
  item: ToolCardItemType;
  systemTitle?: string;
  isLoading?: boolean;
  mode: 'admin' | 'team' | 'marketplace';
  onClickButton: (installed: boolean) => void;
  onClickCard?: () => void;
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

  const statusMap = useMemo(() => {
    if (mode === 'marketplace') return null;

    const pluginStatusMap: Record<number, { label: string; color: string; icon?: string } | null> =
      {
        [PluginStatusEnum.Offline]: {
          label: t('app:toolkit_status_offline'),
          color: 'red.600'
        },
        [PluginStatusEnum.SoonOffline]: {
          label: t('app:toolkit_status_soon_offline'),
          color: 'yellow.600'
        }
      };

    const installedStatusMap = item.installed
      ? {
          label: t('app:toolkit_installed'),
          color: 'myGray.500',
          icon: 'common/check'
        }
      : null;

    if (mode === 'admin') {
      return installedStatusMap;
    }

    if (mode === 'team') {
      if (item.status && pluginStatusMap[item.status]) {
        return pluginStatusMap[item.status];
      }
      return installedStatusMap;
    }
  }, [item.installed, item.status]);

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
      cursor={onClickCard ? 'pointer' : 'default'}
      onClick={onClickCard}
      _hover={{
        boxShadow: '0 4px 4px 0 rgba(19, 51, 107, 0.05), 0 0 1px 0 rgba(19, 51, 107, 0.08);',
        '& .install-button': {
          display: 'flex'
        }
      }}
    >
      <HStack>
        <Avatar src={item.icon} borderRadius={'sm'} w={'1.5rem'} />
        <Box color={'myGray.900'} fontWeight={'medium'}>
          {parseI18nString(item.name, i18n.language)}
        </Box>
        {statusMap && (
          <Flex fontSize={'12px'} fontWeight={'medium'} color={statusMap.color} gap={1}>
            {statusMap.icon && <MyIcon name={statusMap.icon as any} w={4} />}
            {statusMap.label}
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
          {parseI18nString(item.description || '', i18n.language) ||
            t('app:templateMarket.no_intro')}
        </Box>
      </Box>
      <Flex gap={1} overflow={'hidden'} ref={tagsContainerRef}>
        {item.tags?.slice(0, visibleTagsCount).map((tag) => {
          return (
            <Box
              key={tag}
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
              {tag}
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
        {mode === 'marketplace' ? (
          <Button
            className="install-button"
            size={'sm'}
            variant={'primary'}
            onClick={(e) => {
              e.stopPropagation();
              onClickButton(false);
            }}
            isLoading={isLoading}
            {...(!isLoading ? { display: 'none' } : {})}
          >
            {t('common:Download')}
          </Button>
        ) : (
          <Button
            className="install-button"
            {...(!isLoading ? { display: 'none' } : {})}
            size={'sm'}
            variant={item.installed ? 'primaryOutline' : 'primary'}
            onClick={(e) => {
              e.stopPropagation();
              onClickButton(!item.installed);
            }}
            isLoading={isLoading}
          >
            {item.installed ? t('app:toolkit_uninstall') : t('app:toolkit_install')}
          </Button>
        )}
      </Flex>
    </MyBox>
  );
};

export default React.memo(ToolCard);
