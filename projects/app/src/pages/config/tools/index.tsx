'use client';

import { useEffect, useState } from 'react';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { Box, Button, Center, Flex, useDisclosure } from '@chakra-ui/react';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import DndDrag, { Draggable } from '@fastgpt/web/components/common/DndDrag';
import type { SystemPluginTemplateListItemType } from '@fastgpt/global/core/app/plugin/type';
import { PluginSourceEnum } from '@fastgpt/global/core/app/plugin/constants';
import { splitCombinePluginId } from '@fastgpt/global/core/app/plugin/utils';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import PluginCard from '@/pageComponents/config/tools/PluginCard';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getSystemPlugins, putUpdatePluginOrder } from '@/web/core/app/api/plugin';
import TagManageModal from '@/pageComponents/config/tools/TagManageModal';
import { defaultCustomPluginForm } from '@/pageComponents/config/tools/CustomPluginConfig';
import dynamic from 'next/dynamic';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { useRouter } from 'next/router';

const SystemToolConfigModal = dynamic(
  () => import('@/pageComponents/config/tools/SystemToolConfigModal'),
  {
    ssr: false
  }
);
const CustomPluginConfig = dynamic(
  () => import('@/pageComponents/config/tools/CustomPluginConfig'),
  {
    ssr: false
  }
);
const ImportPluginModal = dynamic(() => import('@/pageComponents/config/tools/ImportPluginModal'), {
  ssr: false
});

const ToolProvider = () => {
  const { t } = useSafeTranslation();
  const router = useRouter();

  const [localPlugins, setLocalPlugins] = useState<Array<SystemPluginTemplateListItemType>>([]);
  const [editingPlugin, setEditingPlugin] = useState<SystemPluginTemplateListItemType>();
  console.log('localPlugins');

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

  const {
    data: tools = [],
    run: refreshTools,
    loading: loadingTools
  } = useRequest2(getSystemPlugins, {
    manual: false
  });

  useEffect(() => {
    setLocalPlugins(tools);
  }, [tools]);

  return (
    <MyBox pt={4} pl={3} pr={8} isLoading={loadingTools}>
      <Flex alignItems={'center'}>
        <Flex flex={'1'} overflow={'auto'}>
          <Box px={4} py={2} fontSize={'16px'} fontWeight={'medium'} color={'myGray.500'}>
            {t('app:toolkit')}
          </Box>
        </Flex>
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
                    router.push('/toolkit/tools/marketplace');
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
                    setEditingPlugin(defaultCustomPluginForm as SystemPluginTemplateListItemType);
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
        <Box w={1.5 / 10} pl={8}>
          {t('app:toolkit_name')}
        </Box>
        <Box w={1.5 / 10}>{t('app:toolkit_tags')}</Box>
        <Box w={2 / 10}>{t('common:Intro')}</Box>
        <Box w={1 / 10} pl={5}>
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
          />
        </Box>
        <Box w={1 / 10}>{t('app:toolkit_call_points')}</Box>
        <Box w={1 / 10} display={'flex'} alignItems={'center'}>
          {t('app:toolkit_system_key')}
          <QuestionTip
            display={'flex'}
            alignItems={'center'}
            ml={1}
            label={t('app:toolkit_system_key_tip')}
          />
        </Box>
      </Flex>

      <Box overflow={'auto'} mt={2} h={'calc(100vh - 150px)'}>
        {localPlugins.length > 0 ? (
          <DndDrag<SystemPluginTemplateListItemType>
            onDragEndCb={async (list: Array<SystemPluginTemplateListItemType>) => {
              const newOrder = list.map((item, index) => ({
                pluginId: item.id,
                pluginOrder: index
              }));
              setLocalPlugins(list);
              await putUpdatePluginOrder({ plugins: newOrder });
            }}
            dataList={localPlugins}
          >
            {({ provided }) => (
              <Flex
                gap={1}
                flex={1}
                flexDirection={'column'}
                {...provided.droppableProps}
                ref={provided.innerRef}
              >
                {localPlugins.map((item, index) => (
                  <Draggable key={item.id} draggableId={item.id} index={index}>
                    {(provided, snapshot) => (
                      <PluginCard
                        key={`${item.id}-${item.defaultInstalled}-${item.hasTokenFee}`}
                        plugin={item}
                        setEditingPlugin={setEditingPlugin}
                        setLocalPlugins={setLocalPlugins}
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
      {isOpenImportModal && <ImportPluginModal onClose={onCloseImportModal} />}
      {!!editingPlugin &&
        splitCombinePluginId(editingPlugin.id).source === PluginSourceEnum.systemTool && (
          <SystemToolConfigModal
            plugin={editingPlugin}
            onSuccess={refreshTools}
            onClose={() => setEditingPlugin(undefined)}
          />
        )}
      {!!editingPlugin &&
        splitCombinePluginId(editingPlugin.id).source !== PluginSourceEnum.systemTool && (
          <CustomPluginConfig
            defaultForm={editingPlugin}
            onSuccess={refreshTools}
            onClose={() => setEditingPlugin(undefined)}
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
