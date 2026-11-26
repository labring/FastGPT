import React from 'react';
import { ReactFlowCustomProvider } from '../WorkflowComponents/context';
import { useContextSelector } from 'use-context-selector';
import { AppContext, TabEnum } from '../context';
import { useMount } from 'ahooks';
import Header from './Header';
import { Flex } from '@chakra-ui/react';
import { workflowBoxStyles } from '../constants';
import dynamic from 'next/dynamic';

import Flow from '../WorkflowComponents/Flow';
import { useWorkflowSessionActions } from '@/web/core/workflow/editor/session/workflowSession';
import { WorkflowUIProvider } from '../WorkflowComponents/Flow/canvas/canvasState';
import { WorkflowModalProvider } from '../WorkflowComponents/Flow/panels/workflowPanelState';
import { WorkflowBuilderUIProvider } from '../WorkflowComponents/WorkflowBuilder/context';

const Logs = dynamic(() => import('../Logs/index'));
const PublishChannel = dynamic(() => import('../Publish'));

const WorkflowEdit = () => {
  const { appDetail, currentTab } = useContextSelector(AppContext, (e) => e);

  const { loadInitialWorkflow } = useWorkflowSessionActions();

  useMount(() => {
    loadInitialWorkflow({
      input: {
        nodes: appDetail.nodes ?? [],
        edges: appDetail.edges ?? [],
        referenceSnapshots: appDetail.referenceSnapshots
      },
      chatConfig: appDetail.chatConfig
    });
  });

  // renderer 层交互状态：Header 与画布都要读写弹窗/交互 Context，挂在两者共同祖先。
  return (
    <WorkflowUIProvider>
      <WorkflowModalProvider>
        <Flex {...workflowBoxStyles}>
          <Header />

          {currentTab === TabEnum.appEdit ? (
            <WorkflowBuilderUIProvider
              appId={appDetail._id}
              canEdit={!!appDetail.permission?.hasWritePer}
              entryAccess={'hidden'}
              systemInitialized={true}
            >
              <Flow />
            </WorkflowBuilderUIProvider>
          ) : (
            <Flex
              flexDirection={'column'}
              flex={1}
              minH={0}
              mt={'72px'}
              px={4}
              pb={4}
              bg={'white'}
              overflowY={'auto'}
              overflowX={'hidden'}
            >
              {currentTab === TabEnum.publish && <PublishChannel />}
              {currentTab === TabEnum.logs && <Logs />}
            </Flex>
          )}
        </Flex>
      </WorkflowModalProvider>
    </WorkflowUIProvider>
  );
};

const Render = () => {
  return (
    <ReactFlowCustomProvider>
      <WorkflowEdit />
    </ReactFlowCustomProvider>
  );
};

export default Render;
