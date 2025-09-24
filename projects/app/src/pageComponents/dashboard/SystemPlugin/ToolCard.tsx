import { useSystemStore } from '@/web/common/system/useSystemStore';
import { Box, Flex, HStack } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyBox from '@fastgpt/web/components/common/MyBox';
import React, { useState } from 'react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { type NodeTemplateListItemType } from '@fastgpt/global/core/workflow/type/node';
import { type SystemToolGroupSchemaType } from '@fastgpt/service/core/app/plugin/type';
import UseGuideModal from '@/components/common/Modal/UseGuideModal';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { pluginClient } from '@/web/core/app/api/plugin';
import { useUserStore } from '@/web/support/user/useUserStore';

const PluginCard = ({
  item,
  groups,
  refreshTools
}: {
  item: NodeTemplateListItemType;
  groups: SystemToolGroupSchemaType[];
  refreshTools: () => any;
}) => {
  const { t, i18n } = useTranslation();
  const { feConfigs } = useSystemStore();
  const [isHovered, setIsHovered] = useState(false);

  const { userInfo } = useUserStore();
  const isRoot = userInfo?.username === 'root';

  const { openConfirm, ConfirmModal } = useConfirm({
    type: 'delete',
    content: t('common:sure_delete_tool_cannot_undo')
  });

  const type = groups.reduce<string | undefined>((acc, group) => {
    const foundType = group.groupTypes.find((type) => type.typeId === item.templateType);
    return foundType ? parseI18nString(foundType.typeName, i18n.language) : acc;
  }, undefined);

  const isUploadedPlugin = item.toolSource === 'uploaded';

  const { runAsync: handleDelete } = useRequest2(
    (toolId: string) =>
      pluginClient.tool.upload.delete({
        query: {
          toolId
        }
      }),
    {
      successToast: t('common:delete_success'),
      onSuccess() {
        refreshTools();
      }
    }
  );

  return (
    <MyBox
      key={item.id}
      lineHeight={1.5}
      h="100%"
      pt={4}
      pb={3}
      px={4}
      border={'base'}
      boxShadow={'2'}
      bg={'white'}
      borderRadius={'10px'}
      position={'relative'}
      display={'flex'}
      flexDirection={'column'}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      _hover={{
        borderColor: 'primary.300',
        boxShadow: '1.5'
      }}
    >
      {/* Delete button with centered confirmation modal */}
      {isUploadedPlugin && isRoot && isHovered && (
        <MyIconButton
          icon="delete"
          position="absolute"
          bottom={3}
          right={4}
          color="red.500"
          hoverColor="red.500"
          aria-label={t('common:Delete')}
          zIndex={1}
          pointerEvents={'auto'}
          onClick={openConfirm(() => handleDelete(item.id))}
        />
      )}

      <ConfirmModal />

      <HStack>
        <Avatar src={item.avatar} borderRadius={'sm'} w={'1.5rem'} h={'1.5rem'} />
        <Box flex={'1 0 0'} color={'myGray.900'} fontWeight={500}>
          {item.name}
        </Box>
        <Box mr={'-1rem'}>
          <Flex
            bg={'myGray.100'}
            color={'myGray.600'}
            py={0.5}
            pl={2}
            pr={3}
            borderLeftRadius={'sm'}
            whiteSpace={'nowrap'}
          >
            <Box ml={1} fontSize={'mini'}>
              {t(type as any)}
            </Box>
          </Flex>
        </Box>
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
        <Box className={'textEllipsis2'}>{item.intro || t('app:templateMarket.no_intro')}</Box>
      </Box>

      <Flex w={'full'} fontSize={'mini'}>
        <Flex flex={1}>
          {(item.instructions || item.courseUrl) && (
            <UseGuideModal
              title={item.name}
              iconSrc={item.avatar}
              text={item.instructions}
              link={item.courseUrl}
            >
              {({ onClick }) => (
                <Flex
                  color={'primary.700'}
                  alignItems={'center'}
                  gap={1}
                  cursor={'pointer'}
                  onClick={onClick}
                  _hover={{ bg: 'myGray.100' }}
                >
                  <MyIcon name={'book'} w={'14px'} />
                  {t('app:plugin.Instructions')}
                </Flex>
              )}
            </UseGuideModal>
          )}
        </Flex>
        {/* Hide author info when showing delete button but maintain space */}
        <Box color={'myGray.500'} visibility={isUploadedPlugin && isHovered ? 'hidden' : 'visible'}>
          {`by ${item.author || feConfigs.systemTitle}`}
        </Box>
      </Flex>
    </MyBox>
  );
};

export default React.memo(PluginCard);
