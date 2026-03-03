import { Box, Button, Flex, HStack } from '@chakra-ui/react';
import Avatar from '../../../common/Avatar';
import MyBox from '../../../common/MyBox';
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import MyIcon from '../../../common/Icon';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';

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
  update?: boolean;
  downloadCount?: number;
};

/**
  3 种使用场景：
  1. admin 视角插件市场：显示是否安装，是否更新，无状态，显示安装/卸载
  2. team 视角资源库：显示是否安装，不显示更新，状态文本，以及安装/卸载
  3. 开放的插件市场：不显示任何状态，只显示下载按钮
*/
const ToolCard = ({
  item,
  systemTitle,
  isInstallingOrDeleting,
  isUpdating,
  mode,
  onInstall,
  onDelete,
  onUpdate,
  onClickCard
}: {
  item: ToolCardItemType;
  systemTitle?: string;
  isInstallingOrDeleting?: boolean;
  isUpdating?: boolean;
  mode: 'admin' | 'team' | 'marketplace';
  onInstall: () => Promise<void>;
  onDelete?: () => Promise<void>;
  onUpdate?: () => Promise<void>;
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

  const statusLabel = useMemo(() => {
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

    if (mode === 'admin') {
      return item.installed
        ? {
            label: t('app:toolkit_installed'),
            color: 'myGray.500',
            icon: 'common/check'
          }
        : null;
    }

    if (mode === 'team') {
      if (item.status && pluginStatusMap[item.status]) {
        return pluginStatusMap[item.status];
      }
      return item.installed
        ? {
            label: t('app:toolkit_installed'),
            color: 'myGray.500',
            icon: 'common/check'
          }
        : null;
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
      position={'relative'}
      onClick={() => {
        if (isInstallingOrDeleting || isUpdating) return;
        onClickCard?.();
      }}
      _hover={{
        boxShadow: '0 4px 4px 0 rgba(19, 51, 107, 0.05), 0 0 1px 0 rgba(19, 51, 107, 0.08);',
        '& .install-button': {
          display: 'flex'
        },
        '& .update-button': {
          display: 'flex'
        },
        // Only hide author info when there are multiple buttons
        ...(item.update && mode === 'admin'
          ? {
              '& .author-info': {
                display: 'none'
              }
            }
          : {}),
        '& .download-count': {
          display: 'none'
        }
      }}
    >
      {/* Update badge in top-right corner */}
      {item.update && mode === 'admin' && (
        <Flex
          alignItems="center"
          position={'absolute'}
          top={4}
          right={4}
          px={2}
          py={0.5}
          bg={'rgb(255, 247, 237)'}
          color={'rgba(234,88,12,1)'}
          fontSize={'12px'}
          fontWeight={'medium'}
          borderRadius={'0.5rem'}
          borderColor={'rgba(255,237,213,1)'}
          borderWidth={'1px'}
          zIndex={1}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path>
          </svg>
          {t('app:app.modules.has new version')}
        </Flex>
      )}

      <HStack>
        <Avatar src={item.icon} borderRadius={'sm'} w={'1.5rem'} />
        <Box color={'myGray.900'} fontWeight={'medium'}>
          {parseI18nString(item.name, i18n.language)}
        </Box>
        {statusLabel && (
          <Flex fontSize={'12px'} fontWeight={'medium'} color={statusLabel.color} gap={1}>
            {statusLabel.icon && <MyIcon name={statusLabel.icon as any} w={4} />}
            {statusLabel.label}
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
        <Box
          className="author-info"
          color={'myGray.500'}
          mt={3}
        >{`by ${item.author || systemTitle || 'FastGPT'}`}</Box>
        {/*TODO: when statistics is ready*/}
        {/*<Flex flexDirection={'row'} gap={1} className="download-count" color={'myGray.500'} mt={3}>
          <MyIcon name="common/downloadLine" />
          {!item.downloadCount
            ? 0
            : item.downloadCount < 1000
              ? `${item.downloadCount}`
              : `${(item.downloadCount / 1000).toFixed(1)}k`}
        </Flex>*/}

        <Flex gap={2} alignItems={'center'} ml={'auto'}>
          {mode === 'marketplace' ? (
            <Button
              className="install-button"
              size={'sm'}
              variant={'primary'}
              onClick={(e) => {
                e.stopPropagation();
                onInstall();
              }}
              isLoading={isInstallingOrDeleting}
              {...(!isInstallingOrDeleting ? { display: 'none' } : {})}
            >
              {t('common:Download')}
            </Button>
          ) : (
            <Button
              className="install-button"
              size={'sm'}
              variant={item.installed ? 'primaryOutline' : 'primary'}
              onClick={async (e) => {
                e.stopPropagation();
                if (item.installed) {
                  // delete
                  if (onDelete) {
                    return onDelete();
                  }
                } else {
                  return onInstall();
                }
              }}
              isLoading={isInstallingOrDeleting}
              {...(!isInstallingOrDeleting ? { display: 'none' } : {})}
              isDisabled={isUpdating}
            >
              {item.installed ? t('app:toolkit_uninstall') : t('app:toolkit_install')}
            </Button>
          )}

          {/* Update button for admin mode when update is available */}
          {item.update && mode === 'admin' && onUpdate && (
            <Button
              className="update-button"
              size={'sm'}
              variant={'primary'}
              onClick={async (e) => {
                e.stopPropagation();
                return onUpdate();
              }}
              isLoading={isUpdating}
              display={'none'}
            >
              {t('app:custom_plugin_update')}
            </Button>
          )}
        </Flex>
      </Flex>
    </MyBox>
  );
};

export default React.memo(ToolCard);
