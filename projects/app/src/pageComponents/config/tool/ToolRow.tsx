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
import { putAdminUpdateTool } from '@/web/core/plugin/admin/tool/api';
import React, { useRef, useState, useEffect } from 'react';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import type { AdminSystemToolListItemType } from '@fastgpt/global/core/plugin/admin/tool/type';
import type { GetAdminSystemToolsResponseType } from '@fastgpt/global/openapi/core/plugin/admin/tool/api';

const ToolRow = ({
  tool,
  setEditingToolId,
  setLocalTools,
  provided,
  snapshot
}: {
  tool: AdminSystemToolListItemType;
  setEditingToolId: (toolId: string) => void;
  setLocalTools: React.Dispatch<React.SetStateAction<GetAdminSystemToolsResponseType>>;
  provided: DraggableProvided;
  snapshot: DraggableStateSnapshot;
}) => {
  const { t, i18n } = useTranslation();

  const { runAsync: updateSystemTool, loading } = useRequest2(
    async (updateFields: {
      defaultInstalled?: boolean;
      hasTokenFee?: boolean;
      status?: PluginStatusEnum;
    }) => {
      return putAdminUpdateTool({
        ...tool,
        pluginId: tool.id,
        defaultInstalled: updateFields.defaultInstalled,
        hasTokenFee: updateFields.hasTokenFee,
        status: updateFields.status
      });
    },
    {
      onSuccess: (_, updateFields) => {
        setLocalTools((prev) =>
          prev.map((item) => (item.id === tool.id ? { ...item, ...updateFields[0] } : item))
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
        setEditingToolId(tool.id);
      }}
    >
      <Box display={'flex'} w={2 / 10} pl={2}>
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
        <Avatar src={tool?.avatar} borderRadius={'xs'} w={'20px'} />
        <Box
          pl={1.5}
          fontWeight={'medium'}
          whiteSpace={'nowrap'}
          overflow={'hidden'}
          textOverflow={'ellipsis'}
        >
          {tool?.name}
        </Box>
        {/* {tool?.isOfficial && (
          <Box color={'myGray.500'} ml={3} whiteSpace={'nowrap'}>
            {t('app:toolkit_official')}
          </Box>
        )} */}
      </Box>
      <Box w={1.5 / 10}>
        {tool.tags && tool.tags.length > 0 ? (
          <Flex gap={1} overflow={'hidden'} whiteSpace={'nowrap'}>
            {tool.tags.map((tag, index) => (
              <Box
                key={index}
                as={'span'}
                bg={'myGray.100'}
                px={2}
                py={1}
                color={'myGray.700'}
                borderRadius={'8px'}
                fontSize={'xs'}
                flexShrink={0}
                data-tag-item
              >
                {tag}
              </Box>
            ))}
          </Flex>
        ) : (
          <Box as={'span'} color={'myGray.500'} fontSize={'xs'}>
            -
          </Box>
        )}
      </Box>
      <Box w={2.5 / 10} overflow={'hidden'} textOverflow={'ellipsis'} whiteSpace={'nowrap'}>
        {tool?.intro || '-'}
      </Box>
      <Box w={1 / 10} pl={6}>
        <Box
          as={'span'}
          color={
            tool.status === PluginStatusEnum.Offline
              ? 'red.600'
              : tool.status === PluginStatusEnum.SoonOffline
                ? 'yellow.500'
                : 'myGray.600'
          }
        >
          {tool.status === PluginStatusEnum.Offline
            ? t('app:toolkit_status_offline')
            : tool.status === PluginStatusEnum.SoonOffline
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
            const newDefaultInstalled = !tool?.defaultInstalled;
            const updateFields: {
              defaultInstalled: boolean;
              status?: number;
            } = {
              defaultInstalled: newDefaultInstalled
            };
            if (newDefaultInstalled && tool.status !== PluginStatusEnum.Normal) {
              updateFields.status = PluginStatusEnum.Normal;
            }
            updateSystemTool(updateFields);
          }}
        >
          <Checkbox isChecked={tool.defaultInstalled} colorScheme="primary" />
        </Box>
      </Box>
      <Box w={1 / 10}>
        {tool?.associatedPluginId ? (
          <Box
            as={'span'}
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              e.preventDefault();
              updateSystemTool({
                hasTokenFee: !tool?.hasTokenFee
              });
            }}
            pl={2}
          >
            <Switch isChecked={tool?.hasTokenFee} size={'sm'} />
          </Box>
        ) : (
          <Box pl={4}>-</Box>
        )}
      </Box>
      <Box w={1 / 10}>
        {!!tool?.hasSecretInput ? (
          <Box color={tool?.hasSystemSecret ? 'green.600' : 'myGray.500'}>
            {tool?.hasSystemSecret
              ? t('app:toolkit_system_key_configured')
              : t('app:toolkit_system_key_not_configured')}
          </Box>
        ) : (
          <Box pl={4}>-</Box>
        )}
      </Box>
    </MyBox>
  );
};

export default React.memo(ToolRow);
