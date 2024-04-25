import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Box, Flex, IconButton, useTheme, useDisclosure, Button } from '@chakra-ui/react';
import { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/index.d';
import { AppSchema } from '@fastgpt/global/core/app/type.d';
import { useTranslation } from 'next-i18next';
import { useCopyData } from '@/web/common/hooks/useCopyData';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import dynamic from 'next/dynamic';

import MyIcon from '@fastgpt/web/components/common/Icon';
import ChatTest, { type ChatTestComponentRef } from '@/components/core/workflow/Flow/ChatTest';
import {
  getWorkflowStore,
  useFlowProviderStore
} from '@/components/core/workflow/Flow/FlowProvider';
import { flowNode2StoreNodes } from '@/components/core/workflow/utils';
import { useAppStore } from '@/web/core/app/store/useAppStore';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { getErrText } from '@fastgpt/global/common/error/utils';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import {
  checkWorkflowNodeAndConnection,
  filterSensitiveNodesData
} from '@/web/core/workflow/utils';

const ImportSettings = dynamic(() => import('@/components/core/workflow/Flow/ImportSettings'));

type Props = { app: AppSchema; onClose: () => void };

const RenderHeaderContainer = React.memo(function RenderHeaderContainer({
  app,
  ChatTestRef,
  setWorkflowTestData,
  onClose
}: Props & {
  ChatTestRef: React.RefObject<ChatTestComponentRef>;
  setWorkflowTestData: React.Dispatch<
    React.SetStateAction<
      | {
          nodes: StoreNodeItemType[];
          edges: StoreEdgeItemType[];
        }
      | undefined
    >
  >;
}) {
  const theme = useTheme();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { copyData } = useCopyData();
  const { openConfirm: openConfirmOut, ConfirmModal } = useConfirm({
    content: t('core.app.edit.Out Ad Edit')
  });
  const { isOpen: isOpenImport, onOpen: onOpenImport, onClose: onCloseImport } = useDisclosure();
  const { updateAppDetail } = useAppStore();
  const { edges, onUpdateNodeError } = useFlowProviderStore();
  const [isSaving, setIsSaving] = useState(false);

  const flowData2StoreDataAndCheck = useCallback(async () => {
    const { nodes } = await getWorkflowStore();
    const checkResults = checkWorkflowNodeAndConnection({ nodes, edges });

    if (!checkResults) {
      const storeNodes = flowNode2StoreNodes({ nodes, edges });

      return storeNodes;
    } else {
      checkResults.forEach((nodeId) => onUpdateNodeError(nodeId, true));
      toast({
        status: 'warning',
        title: t('core.workflow.Check Failed')
      });
    }
  }, [edges, onUpdateNodeError, t, toast]);

  const onclickSave = useCallback(
    async ({ nodes, edges }: { nodes: StoreNodeItemType[]; edges: StoreEdgeItemType[] }) => {
      setIsSaving(true);
      try {
        await updateAppDetail(app._id, {
          modules: nodes,
          edges,
          type: AppTypeEnum.advanced,
          permission: undefined,
          //@ts-ignore
          version: 'v2'
        });
        toast({
          status: 'success',
          title: t('common.Save Success')
        });
        ChatTestRef.current?.resetChatTest();
      } catch (error) {
        toast({
          status: 'warning',
          title: getErrText(error, t('common.Save Failed'))
        });
      }
      setIsSaving(false);
    },
    [ChatTestRef, app._id, t, toast, updateAppDetail]
  );

  const saveAndBack = useCallback(async () => {
    try {
      const data = await flowData2StoreDataAndCheck();
      if (data) {
        await onclickSave(data);
      }
      onClose();
    } catch (error) {
      toast({
        status: 'warning',
        title: getErrText(error)
      });
    }
  }, [flowData2StoreDataAndCheck, onClose, onclickSave, toast]);

  const Render = useMemo(() => {
    return (
      <>
        <Flex
          py={3}
          px={[2, 5, 8]}
          borderBottom={theme.borders.base}
          alignItems={'center'}
          userSelect={'none'}
          bg={'myGray.25'}
        >
          <IconButton
            size={'smSquare'}
            icon={<MyIcon name={'common/backFill'} w={'14px'} />}
            borderRadius={'50%'}
            w={'26px'}
            h={'26px'}
            borderColor={'myGray.300'}
            variant={'whiteBase'}
            aria-label={''}
            isLoading={isSaving}
            onClick={openConfirmOut(saveAndBack, onClose)}
          />
          <Box ml={[3, 6]} fontSize={['md', '2xl']} flex={1}>
            {app.name}
          </Box>

          <MyMenu
            Button={
              <IconButton
                mr={[3, 5]}
                icon={<MyIcon name={'more'} w={'14px'} p={2} />}
                aria-label={''}
                size={'sm'}
                variant={'whitePrimary'}
              />
            }
            menuList={[
              {
                label: t('app.Import Configs'),
                icon: 'common/importLight',
                onClick: onOpenImport
              },
              {
                label: t('app.Export Configs'),
                icon: 'export',
                onClick: async () => {
                  const data = await flowData2StoreDataAndCheck();
                  if (data) {
                    copyData(
                      JSON.stringify(
                        {
                          nodes: filterSensitiveNodesData(data.nodes),
                          edges: data.edges
                        },
                        null,
                        2
                      ),
                      t('app.Export Config Successful')
                    );
                  }
                }
              }
            ]}
          />

          <Button
            mr={[3, 5]}
            size={'sm'}
            leftIcon={<MyIcon name={'core/chat/chatLight'} w={['14px', '16px']} />}
            variant={'whitePrimary'}
            onClick={async () => {
              const data = await flowData2StoreDataAndCheck();
              if (data) {
                setWorkflowTestData(data);
              }
            }}
          >
            {t('core.Chat test')}
          </Button>

          <Button
            size={'sm'}
            isLoading={isSaving}
            leftIcon={<MyIcon name={'common/saveFill'} w={['14px', '16px']} />}
            onClick={async () => {
              const modules = await flowData2StoreDataAndCheck();
              if (modules) {
                onclickSave(modules);
              }
            }}
          >
            {t('common.Save')}
          </Button>
        </Flex>
        <ConfirmModal
          closeText={t('core.app.edit.UnSave')}
          confirmText={t('core.app.edit.Save and out')}
        />
      </>
    );
  }, [
    ConfirmModal,
    app.name,
    copyData,
    flowData2StoreDataAndCheck,
    isSaving,
    onClose,
    onOpenImport,
    onclickSave,
    openConfirmOut,
    saveAndBack,
    setWorkflowTestData,
    t,
    theme.borders.base
  ]);

  return (
    <>
      {Render}
      {isOpenImport && <ImportSettings onClose={onCloseImport} />}
    </>
  );
});

const Header = (props: Props) => {
  const { app } = props;
  const ChatTestRef = useRef<ChatTestComponentRef>(null);

  const [workflowTestData, setWorkflowTestData] = useState<{
    nodes: StoreNodeItemType[];
    edges: StoreEdgeItemType[];
  }>();

  return (
    <>
      <RenderHeaderContainer
        {...props}
        ChatTestRef={ChatTestRef}
        setWorkflowTestData={setWorkflowTestData}
      />
      <ChatTest
        ref={ChatTestRef}
        {...workflowTestData}
        app={app}
        onClose={() => setWorkflowTestData(undefined)}
      />
    </>
  );
};

export default React.memo(Header);
