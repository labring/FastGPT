import { Box, Button, Flex, HStack } from '@chakra-ui/react';
import Avatar from '../../../common/Avatar';
import MyBox from '../../../common/MyBox';
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import MyIcon from '../../../common/Icon';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { PluginStatusEnum, type PluginStatusType } from '@fastgpt/global/core/plugin/type';
import DebugToolTag from './DebugToolTag';
import SystemToolTag from './SystemToolTag';
import { normalizeToolCardTags } from './utils';
import { isTeamPluginSource } from '@fastgpt/global/core/app/tool/utils';

const marketplaceOfficialSource = 'official';

export type ToolCardItemType = {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  author?: string;
  tags?: string[] | null;
  downloadUrl?: string;
  status?: PluginStatusType;
  installed?: boolean;
  update?: boolean;
  version?: string;
  installedVersion?: string;
  etag?: string;
  downloadCount?: number;
  associatedPluginId?: string;
  source?: string;
  registrySource?: 'system' | 'team';
  isDebug?: boolean;
  teamInstallStatus?: string;
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
  onClickCard,
  showActionButton = true,
  showDeleteButton = false,
  showRegistrySourceBadge = true,
  variant = 'default'
}: {
  item: ToolCardItemType;
  systemTitle?: string;
  isInstallingOrDeleting?: boolean;
  isUpdating?: boolean;
  mode: 'admin' | 'team' | 'marketplace';
  onInstall?: () => Promise<void>;
  onDelete?: () => void | Promise<void>;
  onUpdate?: () => Promise<void>;
  onClickCard?: () => void;
  showActionButton?: boolean;
  showDeleteButton?: boolean;
  showRegistrySourceBadge?: boolean;
  variant?: 'default' | 'marketplace';
}) => {
  const { t, i18n } = useTranslation();
  const tagsContainerRef = useRef<HTMLDivElement>(null);
  const displayTags = useMemo(() => normalizeToolCardTags(item.tags), [item.tags]);
  const tagsKey = useMemo(() => displayTags.join('\u0000'), [displayTags]);
  const [visibleTags, setVisibleTags] = useState({
    key: tagsKey,
    count: displayTags.length
  });
  const visibleTagsCount =
    visibleTags.key === tagsKey
      ? Math.min(visibleTags.count, displayTags.length)
      : displayTags.length;
  const isMarketplaceVariant = variant === 'marketplace';
  const showOfficialBadge =
    isMarketplaceVariant && (!item.source || item.source === marketplaceOfficialSource);
  const shouldShowRegistrySourceBadge =
    showRegistrySourceBadge && mode === 'team' && !!item.registrySource;
  const showMarketplaceUninstallButton =
    isMarketplaceVariant && mode === 'admin' && item.installed && !showActionButton;
  const showTeamDeleteButton =
    showDeleteButton &&
    mode === 'team' &&
    isTeamPluginSource(item.source) &&
    item.teamInstallStatus === 'installed' &&
    !!onDelete;

  useEffect(() => {
    if (displayTags.length === 0) return;

    const calculate = () => {
      const container = tagsContainerRef.current;
      if (!container) return;

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

      const nextCount = Math.max(1, count);
      setVisibleTags((previous) =>
        previous.key === tagsKey && previous.count === nextCount
          ? previous
          : { key: tagsKey, count: nextCount }
      );
    };

    const timer = setTimeout(calculate, 0);
    const observer = new ResizeObserver(calculate);
    if (tagsContainerRef.current) observer.observe(tagsContainerRef.current);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [displayTags, tagsKey]);

  const statusLabel = useMemo(() => {
    if (mode === 'marketplace') return null;

    const pluginStatusMap: Partial<
      Record<PluginStatusType, { label: string; color: string; icon?: string } | null>
    > = {
      [PluginStatusEnum.Offline]: {
        label: t('common:error.tool_not_exist'),
        color: 'red.600'
      },
      [PluginStatusEnum.SoonOffline]: {
        label: t('app:toolkit_status_soon_offline'),
        color: 'yellow.600'
      },
      [PluginStatusEnum.Hidden]: {
        label: t('app:toolkit_status_hidden'),
        color: 'myGray.500'
      }
    };

    if (mode === 'admin') {
      if (isMarketplaceVariant) return null;
      return null;
    }

    if (mode === 'team') {
      if (item.status && pluginStatusMap[item.status]) {
        return pluginStatusMap[item.status];
      }
      return null;
    }
  }, [isMarketplaceVariant, item.status, mode, t]);

  return (
    <MyBox
      key={item.id}
      {...(isMarketplaceVariant
        ? {
            px: '17px',
            pt: '17px',
            pb: '13px',
            minH: '178px',
            border: '1px solid',
            borderColor: '#DFE2EA'
          }
        : {
            p: 4,
            pb: 3,
            border: 'base'
          })}
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
        ...(showActionButton || showMarketplaceUninstallButton || showTeamDeleteButton
          ? {
              '& .install-button': {
                display: 'flex'
              }
            }
          : {}),
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
      <HStack
        minW={0}
        spacing={isMarketplaceVariant ? 2 : undefined}
        h={isMarketplaceVariant ? '24px' : undefined}
      >
        <Avatar
          src={item.icon}
          borderRadius={'sm'}
          w={isMarketplaceVariant ? '24px' : '1.5rem'}
          h={isMarketplaceVariant ? '24px' : undefined}
          flexShrink={0}
        />
        <Flex alignItems={'center'} gap={2} flex={'1 1 auto'} minW={0}>
          <Box
            color={isMarketplaceVariant ? '#111824' : 'myGray.900'}
            fontSize={isMarketplaceVariant ? '16px' : undefined}
            lineHeight={isMarketplaceVariant ? '24px' : undefined}
            fontWeight={'medium'}
            minW={0}
            flex={'0 1 auto'}
            className={'textEllipsis'}
          >
            {parseI18nString(item.name, i18n.language)}
          </Box>
          {shouldShowRegistrySourceBadge && item.registrySource === 'system' && <SystemToolTag />}
        </Flex>
        {showOfficialBadge && (
          <Box
            px={'8px'}
            py={'4px'}
            borderRadius={'6px'}
            bg={'#F0F4FF'}
            color={'#3370FF'}
            fontSize={'10px'}
            lineHeight={'14px'}
            fontWeight={'medium'}
            letterSpacing={'0.2px'}
            flexShrink={0}
          >
            {t('app:toolkit_official')}
          </Box>
        )}
        {item.isDebug && <DebugToolTag />}
        {item.update && mode === 'admin' && !item.isDebug && (
          <Flex
            alignItems="center"
            flexShrink={0}
            px={2}
            py={0.5}
            bg={'rgb(255, 247, 237)'}
            color={'rgba(234,88,12,1)'}
            fontSize={'12px'}
            fontWeight={'medium'}
            borderRadius={'0.5rem'}
            borderColor={'rgba(255,237,213,1)'}
            borderWidth={'1px'}
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
        {statusLabel && (
          <Flex
            flexShrink={0}
            fontSize={'12px'}
            fontWeight={'medium'}
            color={statusLabel.color}
            gap={1}
          >
            {statusLabel.icon && <MyIcon name={statusLabel.icon as any} w={4} />}
            {statusLabel.label}
          </Flex>
        )}
      </HStack>
      <Box
        flex={isMarketplaceVariant ? '1 0 68px' : ['1 0 48px', '1 0 56px']}
        mt={isMarketplaceVariant ? undefined : 3}
        pt={isMarketplaceVariant ? '12px' : undefined}
        pr={1}
        textAlign={'justify'}
        wordBreak={'break-all'}
        fontSize={isMarketplaceVariant ? '12.8px' : 'xs'}
        lineHeight={isMarketplaceVariant ? '19.2px' : undefined}
        color={isMarketplaceVariant ? '#667085' : 'myGray.500'}
      >
        <Box className={'textEllipsis2'}>
          {parseI18nString(item.description || '', i18n.language) ||
            t('app:templateMarket.no_intro')}
        </Box>
      </Box>
      <Flex
        h={isMarketplaceVariant ? '26.5px' : undefined}
        gap={1}
        overflow={'hidden'}
        ref={tagsContainerRef}
      >
        {displayTags.slice(0, visibleTagsCount).map((tag) => {
          return (
            <Box
              key={tag}
              px={isMarketplaceVariant ? '9px' : 2}
              py={isMarketplaceVariant ? '5px' : 1}
              border={'1px solid'}
              borderRadius={'6px'}
              borderColor={isMarketplaceVariant ? '#E8EBF0' : 'myGray.200'}
              fontSize={'11px'}
              lineHeight={isMarketplaceVariant ? '16.5px' : undefined}
              fontWeight={'medium'}
              color={isMarketplaceVariant ? '#383F50' : 'myGray.700'}
              flexShrink={0}
              data-tag-item
            >
              {tag}
            </Box>
          );
        })}
        {displayTags.length > visibleTagsCount && (
          <Box
            px={isMarketplaceVariant ? '9px' : 2}
            py={isMarketplaceVariant ? '5px' : 1}
            border={'1px solid'}
            borderRadius={'6px'}
            borderColor={isMarketplaceVariant ? '#E8EBF0' : 'myGray.200'}
            fontSize={'11px'}
            lineHeight={isMarketplaceVariant ? '16.5px' : undefined}
            fontWeight={'medium'}
            color={isMarketplaceVariant ? '#383F50' : 'myGray.700'}
            flexShrink={0}
          >
            +{displayTags.length - visibleTagsCount}
          </Box>
        )}
      </Flex>

      <Flex
        w={'full'}
        h={isMarketplaceVariant ? '30px' : undefined}
        fontSize={isMarketplaceVariant ? '12px' : 'mini'}
        lineHeight={isMarketplaceVariant ? '18px' : undefined}
        alignItems={'end'}
        justifyContent={'space-between'}
      >
        <Box
          className="author-info"
          color={isMarketplaceVariant ? '#667085' : 'myGray.500'}
          mt={isMarketplaceVariant ? undefined : 3}
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
          {showMarketplaceUninstallButton ? (
            <Button
              className="install-button"
              size={'sm'}
              variant={'dangerOutline'}
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.();
              }}
              isLoading={isInstallingOrDeleting}
              display={'none'}
            >
              {t('app:toolkit_uninstall')}
            </Button>
          ) : showTeamDeleteButton ? (
            <Button
              className="install-button"
              size={'sm'}
              variant={'dangerOutline'}
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.();
              }}
              isLoading={isInstallingOrDeleting}
              display={'none'}
            >
              {t('app:toolkit_uninstall')}
            </Button>
          ) : showActionButton && mode === 'marketplace' ? (
            <Button
              className="install-button"
              size={'sm'}
              variant={'primary'}
              onClick={(e) => {
                e.stopPropagation();
                onInstall?.();
              }}
              isLoading={isInstallingOrDeleting}
              {...(!isInstallingOrDeleting ? { display: 'none' } : {})}
            >
              {t('common:Download')}
            </Button>
          ) : showActionButton ? (
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
                  return onInstall?.();
                }
              }}
              isLoading={isInstallingOrDeleting}
              {...(!isInstallingOrDeleting ? { display: 'none' } : {})}
              isDisabled={isUpdating}
            >
              {item.installed ? t('app:toolkit_uninstall') : t('app:toolkit_install')}
            </Button>
          ) : null}

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
