import { Box, Flex } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import type {
  DraggableProvided,
  DraggableStateSnapshot
} from '@fastgpt/web/components/common/DndDrag';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useTranslation } from 'next-i18next';
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
  const { t } = useTranslation();

  return (
    <MyBox
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
      <Box display={'flex'} w={2.2 / 10} pl={2}>
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
      <Box w={4.1 / 10} overflow={'hidden'} textOverflow={'ellipsis'} whiteSpace={'nowrap'}>
        {tool?.intro || '-'}
      </Box>
      <Box w={1.1 / 10} pl={6}>
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
      <Box w={1.1 / 10}>
        {tool.systemSecretStatus === SystemToolSystemSecretStatusEnum.none ? (
          <Box pl={4}>-</Box>
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
      </Box>
    </MyBox>
  );
};

export default React.memo(ToolRow);
