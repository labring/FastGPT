import { Box, Flex, Td, Tr } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import type {
  DraggableProvided,
  DraggableStateSnapshot
} from '@fastgpt/web/components/common/DndDrag';
import { getDraggableItemProps } from '@fastgpt/web/components/common/DndDrag';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import React from 'react';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import type { AdminSystemToolListItemType } from '@fastgpt/global/core/app/tool/systemTool/type';
import { SystemToolSystemSecretStatusEnum } from '@fastgpt/global/core/app/tool/systemTool/constants';

const ToolRow = ({
  tool,
  setEditingToolId,
  provided,
  snapshot
}: {
  tool: AdminSystemToolListItemType;
  setEditingToolId: (toolId: string) => void;
  provided: DraggableProvided;
  snapshot: DraggableStateSnapshot;
}) => {
  const { t } = useClientTranslation('app');
  const { draggableItemProps, dragHandleProps } = getDraggableItemProps(provided, snapshot);

  return (
    <Tr
      {...draggableItemProps}
      cursor={'pointer'}
      bg={'white'}
      h={12}
      fontSize={'mini'}
      _hover={{ bg: 'primary.50' }}
      onClick={() => setEditingToolId(tool.id)}
      sx={{
        '& > td': {
          borderBottom: '1px solid',
          borderColor: 'myGray.200',
          py: 0,
          overflow: 'hidden'
        }
      }}
    >
      <Td px={2}>
        <Flex alignItems={'center'} minW={0}>
          <Flex
            h={'full'}
            rounded={'xs'}
            mr={2.5}
            onClick={(e) => e.stopPropagation()}
            _hover={{ bg: 'myGray.05' }}
            {...dragHandleProps}
          >
            <MyIcon name="drag" w={'14px'} color={'myGray.500'} cursor={'grab'} />
          </Flex>
          <Avatar src={tool?.avatar} borderRadius={'xs'} w={'20px'} flexShrink={0} />
          <MyTooltip label={tool?.name} showOnlyWhenOverflow shouldWrapChildren={false}>
            <Box pl={1.5} flex={1} minW={0} fontWeight={'medium'} isTruncated>
              {tool?.name}
            </Box>
          </MyTooltip>
        </Flex>
      </Td>
      <Td px={0}>
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
      </Td>
      <Td px={0}>
        <MyTooltip label={tool?.intro || '-'} showOnlyWhenOverflow shouldWrapChildren={false}>
          <Box minW={0} isTruncated>
            {tool?.intro || '-'}
          </Box>
        </MyTooltip>
      </Td>
      <Td px={0} pl={6}>
        <Box
          as={'span'}
          color={
            tool.status === PluginStatusEnum.Offline
              ? 'red.600'
              : tool.status === PluginStatusEnum.SoonOffline
                ? 'yellow.500'
                : tool.status === PluginStatusEnum.Hidden
                  ? 'myGray.500'
                  : 'myGray.600'
          }
        >
          {tool.status === PluginStatusEnum.Offline
            ? t('common:error.tool_not_exist')
            : tool.status === PluginStatusEnum.SoonOffline
              ? t('app:toolkit_status_soon_offline')
              : tool.status === PluginStatusEnum.Hidden
                ? t('app:toolkit_status_hidden')
                : t('app:toolkit_status_normal')}
        </Box>
      </Td>
      <Td px={0}>
        {tool.systemSecretStatus === SystemToolSystemSecretStatusEnum.none ? (
          '-'
        ) : (
          <Box
            color={
              tool.systemSecretStatus === SystemToolSystemSecretStatusEnum.configured
                ? 'green.600'
                : 'myGray.500'
            }
          >
            {tool.systemSecretStatus === SystemToolSystemSecretStatusEnum.configured
              ? t('app:toolkit_system_key_configured')
              : t('app:toolkit_system_key_not_configured')}
          </Box>
        )}
      </Td>
    </Tr>
  );
};

export default React.memo(ToolRow);
