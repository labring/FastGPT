'use client';

import { useState } from 'react';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { Box, Button, Center, Flex, useDisclosure } from '@chakra-ui/react';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import DndDrag, { Draggable } from '@fastgpt/web/components/common/DndDrag';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import { splitCombineToolId } from '@fastgpt/global/core/app/tool/utils';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import ToolRow from '@/pageComponents/config/tool/ToolRow';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import TagManageModal from '@/pageComponents/config/TagManageModal';
import dynamic from 'next/dynamic';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { useRouter } from 'next/router';
import { getAdminSystemTools, putAdminUpdateToolOrder } from '@/web/core/plugin/admin/tool/api';
import type { GetAdminSystemToolsResponseType } from '@fastgpt/global/openapi/core/plugin/admin/tool/api';
import type { AdminSystemToolListItemType } from '@fastgpt/global/core/plugin/admin/tool/type';

const SystemToolConfigModal = dynamic(
  () => import('@/pageComponents/config/tool/SystemToolConfigModal')
);
const WorkflowToolConfig = dynamic(
  () => import('@/pageComponents/config/tool/WorkflowToolConfigModal')
);
const ImportPluginModal = dynamic(() => import('@/pageComponents/config/ImportPluginModal'));

const ToolProvider = () => {
  const { t } = useSafeTranslation();
  const router = useRouter();

  const [localTools, setLocalTools] = useState<GetAdminSystemToolsResponseType>([]);
  const [editingToolId, setEditingToolId] = useState<string>();

  const {
    isOpen: isOpenTagModal,
    onOpen: onOpenTagModal,
    onClose: onCloseTagModal
  } = useDisclosure();
  const {
    isOpen: isOpenImportModal,
    onOpen: onOpenImportModal,
    onClose: onCloseImportModal
  } = useDisclosure();

  const { runAsync: refreshTools, loading: loadingTools } = useRequest2(
    () => getAdminSystemTools({ parentId: null }),
    {
      onSuccess: (data) => {
        if (data) {
          setLocalTools(data);
        }
      },
      manual: false
    }
  );

  return (
    <MyBox pt={4} pl={3} pr={8} isLoading={loadingTools}>
      {/* Header */}
      <Flex alignItems={'center'}>
        <Box flex={'1'} overflow={'auto'} color={'myGray.900'}>
          {t('common:navbar.plugin')}
        </Box>
        <Button onClick={onOpenTagModal} variant={'whiteBase'} mr={2}>
          {t('app:toolkit_tags_manage')}
        </Button>
        <MyMenu
          trigger="hover"
          Button={
            <Button leftIcon={<MyIcon name="common/addLight" w={'18px'} />}>
              {t('app:toolkit_add_resource')}
            </Button>
          }
          menuList={[
            {
              children: [
                {
                  label: t('app:toolkit_open_marketplace'),
                  onClick: () => {
                    router.push('/config/tool/marketplace');
                  }
                },
                {
                  label: t('app:toolkit_import_resource'),
                  onClick: () => {
                    onOpenImportModal();
                  }
                },
                {
                  label: t('app:toolkit_select_app'),
                  onClick: () => {
                    setEditingToolId('');
                  }
                }
              ]
            }
          ]}
        />
      </Flex>

      <Flex
        bg={'white'}
        mt={5}
        h={'50px'}
        rounded={'md'}
        alignItems={'center'}
        fontSize={'mini'}
        fontWeight={'medium'}
        color={'myGray.600'}
      >
        <Box w={2 / 10} pl={8}>
          {t('app:toolkit_name')}
        </Box>
        <Box w={1.5 / 10}>{t('app:toolkit_tags')}</Box>
        <Box w={2.5 / 10}>{t('common:Intro')}</Box>
        <Box w={1 / 10} pl={6}>
          {t('app:toolkit_status')}
        </Box>
        <Box w={1 / 10}>{t('app:toolkit_default_install')}</Box>
        <Box w={1 / 10} display={'flex'} alignItems={'center'}>
          {t('app:toolkit_token_fee')}
          <QuestionTip
            display={'flex'}
            alignItems={'center'}
            ml={1}
            label={t('app:toolkit_token_fee_tip')}
            color={'myGray.300'}
          />
        </Box>
        <Box w={1 / 10} display={'flex'} alignItems={'center'}>
          {t('app:toolkit_system_key')}
          <QuestionTip
            display={'flex'}
            alignItems={'center'}
            ml={1}
            label={t('app:toolkit_system_key_tip')}
            color={'myGray.300'}
          />
        </Box>
      </Flex>

      <Box overflow={'auto'} mt={2} h={'calc(100vh - 150px)'}>
        {localTools.length > 0 ? (
          <DndDrag<AdminSystemToolListItemType>
            onDragEndCb={async (list: Array<AdminSystemToolListItemType>) => {
              const newOrder = list.map((item, index) => ({
                pluginId: item.id,
                pluginOrder: index
              }));
              setLocalTools(list);
              await putAdminUpdateToolOrder({ plugins: newOrder });
            }}
            dataList={localTools}
          >
            {({ provided }) => (
              <Flex
                gap={1}
                flex={1}
                flexDirection={'column'}
                {...provided.droppableProps}
                ref={provided.innerRef}
              >
                {localTools.map((item, index) => (
                  <Draggable key={item.id} draggableId={item.id} index={index}>
                    {(provided, snapshot) => (
                      <ToolRow
                        key={item.id}
                        tool={item}
                        setEditingToolId={setEditingToolId}
                        setLocalTools={setLocalTools}
                        provided={provided}
                        snapshot={snapshot}
                      />
                    )}
                  </Draggable>
                ))}
              </Flex>
            )}
          </DndDrag>
        ) : (
          <Center h={'full'}>
            <EmptyTip text={t('app:toolkit_no_plugins')} py={2} />
          </Center>
        )}
      </Box>

      {isOpenTagModal && <TagManageModal onClose={onCloseTagModal} />}
      {isOpenImportModal && (
        <ImportPluginModal
          onClose={onCloseImportModal}
          onSuccess={refreshTools}
          tools={localTools}
        />
      )}
      {editingToolId !== undefined &&
        splitCombineToolId(editingToolId).source === AppToolSourceEnum.systemTool && (
          <SystemToolConfigModal
            toolId={editingToolId}
            onSuccess={refreshTools}
            onClose={() => setEditingToolId(undefined)}
          />
        )}
      {editingToolId !== undefined &&
        splitCombineToolId(editingToolId).source !== AppToolSourceEnum.systemTool && (
          <WorkflowToolConfig
            toolId={editingToolId}
            onSuccess={refreshTools}
            onClose={() => setEditingToolId(undefined)}
          />
        )}
    </MyBox>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['app', 'file']))
    }
  };
}

export default ToolProvider;
