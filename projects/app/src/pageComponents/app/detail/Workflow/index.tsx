import React, { useCallback, useEffect, useRef, useState } from 'react';
import { appSystemModuleTemplates } from '@fastgpt/global/core/workflow/template/constants';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { v1Workflow2V2 } from '@/web/core/workflow/adapt';

import { useContextSelector } from 'use-context-selector';
import { AppContext, TabEnum } from '../context';
import { useMount } from 'ahooks';
import Header from './Header';
import { Box, Flex } from '@chakra-ui/react';
import { workflowBoxStyles, cardStyles } from '../constants';
import dynamic from 'next/dynamic';
import { cloneDeep } from 'lodash';
import { useTranslation } from 'next-i18next';

import Flow from '../WorkflowComponents/Flow';
import { ReactFlowCustomProvider } from '../WorkflowComponents/context/index';
import { WorkflowUtilsContext } from '../WorkflowComponents/context/workflowUtilsContext';
import CopilotPanel from '../WorkflowComponents/Flow/copilot';

const Logs = dynamic(() => import('../Logs/index'));
const Dashboard = dynamic(() => import('../Dashboard/index'));
const PublishChannel = dynamic(() => import('../Publish'));

const COPILOT_DEFAULT_WIDTH = 400;
const COPILOT_MIN_WIDTH = 280;

const WorkflowEdit = () => {
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const currentTab = useContextSelector(AppContext, (v) => v.currentTab);

  const isV2Workflow = appDetail?.version === 'v2';
  const { t } = useTranslation();

  const { openConfirm, ConfirmModal } = useConfirm({
    showCancel: false,
    content: t('common:info.old_version_attention')
  });

  const initData = useContextSelector(WorkflowUtilsContext, (v) => v.initData);
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [copilotWidth, setCopilotWidth] = useState(COPILOT_DEFAULT_WIDTH);
  const [isCopilotLoading, setIsCopilotLoading] = useState(false);

  // 当 copilot 开始 loading 时自动打开面板
  useEffect(() => {
    if (isCopilotLoading) {
      setIsCopilotOpen(true);
    }
  }, [isCopilotLoading]);

  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(COPILOT_DEFAULT_WIDTH);

  const onResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      dragStartX.current = e.clientX;
      dragStartWidth.current = copilotWidth;

      const maxWidth = Math.floor(window.innerWidth * 0.3);

      const onMouseMove = (ev: MouseEvent) => {
        if (!isDragging.current) return;
        const delta = ev.clientX - dragStartX.current;
        const next = Math.min(
          Math.max(dragStartWidth.current + delta, COPILOT_MIN_WIDTH),
          maxWidth
        );
        setCopilotWidth(next);
      };

      const onMouseUp = () => {
        isDragging.current = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [copilotWidth]
  );

  useMount(() => {
    if (!isV2Workflow) {
      openConfirm({
        onConfirm: () => {
          initData(
            JSON.parse(JSON.stringify(v1Workflow2V2((appDetail.modules || []) as any))),
            true
          );
        }
      })();
    } else {
      initData(
        cloneDeep({
          nodes: appDetail.modules || [],
          edges: appDetail.edges || []
        }),
        true
      );
    }
  });

  return (
    <Flex {...workflowBoxStyles}>
      <Header />

      {currentTab === TabEnum.appEdit ? (
        <Flex flex={1} minH={0} overflow={'hidden'}>
          <Box
            w={isCopilotOpen ? `${copilotWidth}px` : '0'}
            flexShrink={0}
            overflow={'hidden'}
            h={'calc(100% - 64px)'}
            mt={'64px'}
            transition={'width 0.2s'}
            borderRadius={'8px'}
            bg={'white'}
            boxShadow={isCopilotOpen ? '0px 2px 10px 0px rgba(19, 51, 107, 0.16)' : 'none'}
            zIndex={1}
          >
            <CopilotPanel
              onClose={() => setIsCopilotOpen(false)}
              onLoadingChange={setIsCopilotLoading}
            />
          </Box>

          <Flex flex={1} minW={0} flexDirection={'column'} position={'relative'}>
            <Flow
              isCopilotOpen={isCopilotOpen}
              onToggleCopilot={() => setIsCopilotOpen((v) => !v)}
              nodesInteractive={!isCopilotLoading}
            />
          </Flex>
        </Flex>
      ) : (
        <Flex flexDirection={'column'} h={'100%'} mt={'48px'} p={4}>
          <Box flex={1} minH={0} overflow={'hidden'} {...cardStyles}>
            {currentTab === TabEnum.dashboard && <Dashboard />}
            {currentTab === TabEnum.publish && <PublishChannel />}
            {currentTab === TabEnum.logs && <Logs />}
          </Box>
        </Flex>
      )}

      {!isV2Workflow && <ConfirmModal countDown={0} />}
    </Flex>
  );
};

const Render = () => {
  return (
    <ReactFlowCustomProvider templates={appSystemModuleTemplates}>
      <WorkflowEdit />
    </ReactFlowCustomProvider>
  );
};

export default Render;
