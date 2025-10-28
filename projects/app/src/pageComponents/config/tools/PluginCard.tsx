import { Box, Flex, Switch, Checkbox } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import type {
  DraggableProvided,
  DraggableStateSnapshot
} from '@fastgpt/web/components/common/DndDrag';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import type { SystemPluginTemplateListItemType } from '@fastgpt/global/core/app/plugin/type';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { putUpdatePlugin } from '@/web/core/app/api/plugin';
import { useRef, useState, useEffect } from 'react';
import { PluginStatusEnum } from '@fastgpt/global/core/app/plugin/constants';

const PluginCard = ({
  plugin,
  setEditingPlugin,
  setLocalPlugins,
  provided,
  snapshot
}: {
  plugin: SystemPluginTemplateListItemType;
  setEditingPlugin: (plugin: SystemPluginTemplateListItemType) => void;
  setLocalPlugins: React.Dispatch<React.SetStateAction<SystemPluginTemplateListItemType[]>>;
  provided: DraggableProvided;
  snapshot: DraggableStateSnapshot;
}) => {
  const { t, i18n } = useTranslation();
  const tagsContainerRef = useRef<HTMLDivElement>(null);
  const [visibleTagsCount, setVisibleTagsCount] = useState(plugin.tags?.length || 0);

  useEffect(() => {
    const calculate = () => {
      const container = tagsContainerRef.current;
      if (!container || !plugin.tags?.length) return;

      const containerWidth = container.offsetWidth;
      const tagElements = container.querySelectorAll('[data-tag-item]');
      if (!containerWidth || !tagElements.length) return;

      let totalWidth = 0;
      let count = 0;

      for (let i = 0; i < tagElements.length; i++) {
        const width = totalWidth + (tagElements[i] as HTMLElement).offsetWidth + (i > 0 ? 4 : 0);
        if (width + (i < tagElements.length - 1 ? 64 : 0) > containerWidth) break;
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
  }, [plugin.tags]);

  const { runAsync: updateSystemPlugin, loading } = useRequest2(
    async (updateFields: {
      defaultInstalled?: boolean;
      hasTokenFee?: boolean;
      status?: number;
    }) => {
      const payload = {
        ...plugin,
        pluginId: plugin.id,
        defaultInstalled: updateFields.defaultInstalled,
        hasTokenFee: updateFields.hasTokenFee,
        status: updateFields.status
      };

      return putUpdatePlugin(payload);
    },
    {
      onSuccess: (_, updateFields) => {
        setLocalPlugins((prev) =>
          prev.map((item) => (item.id === plugin.id ? { ...item, ...updateFields[0] } : item))
        );
      },
      errorToast: t('app:toolkit_update_failed')
    }
  );

  return (
    <MyBox
      isLoading={loading}
      display={'flex'}
      ref={provided.innerRef}
      {...provided.draggableProps}
      style={{
        ...provided.draggableProps.style,
        opacity: snapshot.isDragging ? 0.8 : 1
      }}
      cursor={'pointer'}
      bg={'white'}
      borderRadius={'md'}
      h={12}
      w={'full'}
      border={'1px solid transparent'}
      _hover={{
        borderColor: 'rgba(51, 112, 255, 0.10)',
        bg: 'primary.50'
      }}
      fontSize={'mini'}
      alignItems={'center'}
      onClick={() => {
        setEditingPlugin(plugin);
      }}
    >
      <Box display={'flex'} w={1.5 / 10} pl={2}>
        <Flex
          h={'full'}
          rounded={'xs'}
          mr={2.5}
          onClick={(e) => {
            e.stopPropagation();
          }}
          _hover={{ bg: 'myGray.05' }}
          {...provided.dragHandleProps}
        >
          <MyIcon name="drag" w={'14px'} color={'myGray.500'} cursor={'grab'} />
        </Flex>
        <Avatar src={plugin?.avatar} borderRadius={'xs'} w={'20px'} />
        <Box
          pl={1.5}
          fontWeight={'medium'}
          whiteSpace={'nowrap'}
          overflow={'hidden'}
          textOverflow={'ellipsis'}
        >
          {plugin?.name}
        </Box>
        {plugin?.isOfficial && (
          <Box color={'myGray.500'} ml={3} whiteSpace={'nowrap'}>
            {t('app:toolkit_official')}
          </Box>
        )}
      </Box>
      <Box w={1.5 / 10}>
        {plugin.tags && plugin.tags.length > 0 ? (
          <Flex gap={1} overflow={'hidden'} whiteSpace={'nowrap'} ref={tagsContainerRef}>
            {plugin.tags.slice(0, visibleTagsCount).map((tag) => (
              <Box
                key={tag.tagId}
                as={'span'}
                bg={'myGray.100'}
                px={2}
                py={'3px'}
                color={'myGray.700'}
                borderRadius={'8px'}
                fontSize={'12px'}
                flexShrink={0}
                data-tag-item
              >
                {parseI18nString(tag.tagName, i18n.language)}
              </Box>
            ))}
            {plugin.tags.length > visibleTagsCount && (
              <Box
                as={'span'}
                bg={'myGray.100'}
                px={2}
                py={1}
                color={'myGray.700'}
                borderRadius={'8px'}
                fontSize={'xs'}
                flexShrink={0}
              >
                +{plugin.tags.length - visibleTagsCount}
              </Box>
            )}
          </Flex>
        ) : (
          <Box as={'span'} color={'myGray.500'} fontSize={'xs'}>
            -
          </Box>
        )}
      </Box>
      <Box w={2 / 10} overflow={'hidden'} textOverflow={'ellipsis'} whiteSpace={'nowrap'}>
        {plugin?.intro}
      </Box>
      <Box w={1 / 10} pl={6}>
        <Box
          as={'span'}
          color={
            plugin.status === 0 ? 'red.600' : plugin.status === 2 ? 'yellow.500' : 'myGray.600'
          }
        >
          {plugin.status === 0
            ? t('app:toolkit_status_offline')
            : plugin.status === 2
              ? t('app:toolkit_status_soon_offline')
              : t('app:toolkit_status_normal')}
        </Box>
      </Box>
      <Box w={1 / 10} pl={4}>
        <Box
          as={'span'}
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            const newDefaultInstalled = !plugin?.defaultInstalled;
            const updateFields: {
              defaultInstalled: boolean;
              status?: number;
            } = {
              defaultInstalled: newDefaultInstalled
            };
            if (newDefaultInstalled && plugin.status !== PluginStatusEnum.Normal) {
              updateFields.status = PluginStatusEnum.Normal;
            }
            updateSystemPlugin(updateFields);
          }}
        >
          <Checkbox isChecked={plugin.defaultInstalled} colorScheme="primary" />
        </Box>
      </Box>
      <Box w={1 / 10}>
        {plugin?.associatedPluginId ? (
          <Box
            as={'span'}
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              e.preventDefault();
              updateSystemPlugin({
                hasTokenFee: !plugin?.hasTokenFee
              });
            }}
          >
            <Switch isChecked={plugin?.hasTokenFee} size={'sm'} />
          </Box>
        ) : (
          '-'
        )}
      </Box>
      <Box w={1 / 10}>{plugin?.associatedPluginId ? plugin?.currentCost ?? 0 : '-'}</Box>
      <Box w={1 / 10}>
        {!!plugin?.inputList ? (
          <Box color={plugin?.hasSystemSecret ? 'green.600' : 'myGray.500'}>
            {plugin?.hasSystemSecret
              ? t('app:toolkit_system_key_configured')
              : t('app:toolkit_system_key_not_configured')}
          </Box>
        ) : (
          '-'
        )}
      </Box>
    </MyBox>
  );
};

export default PluginCard;
