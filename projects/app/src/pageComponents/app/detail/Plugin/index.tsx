import React from 'react';
import { pluginSystemModuleTemplates } from '@fastgpt/global/core/workflow/template/constants';
import { ReactFlowCustomProvider } from '../WorkflowComponents/context';
import { useContextSelector } from 'use-context-selector';
import { AppContext, TabEnum } from '../context';
import { useMount } from 'ahooks';
import Header from './Header';
import { Flex } from '@chakra-ui/react';
import { workflowBoxStyles } from '../constants';
import dynamic from 'next/dynamic';
import { cloneDeep } from 'lodash-es';

import Flow from '../WorkflowComponents/Flow';
import { WorkflowUtilsContext } from '../WorkflowComponents/context/workflowUtilsContext';
import { WorkflowBuilderUIProvider } from '../WorkflowComponents/WorkflowBuilder/context';

const Logs = dynamic(() => import('../Logs/index'));
const PublishChannel = dynamic(() => import('../Publish'));

const WorkflowEdit = () => {
  const { appDetail, currentTab } = useContextSelector(AppContext, (e) => e);

  const initData = useContextSelector(WorkflowUtilsContext, (v) => v.initData);

  useMount(() => {
    initData(
      cloneDeep({
        nodes: appDetail.nodes || [],
        edges: appDetail.edges || []
      }),
      true
    );
  });

  return (
    <Flex {...workflowBoxStyles}>
      <Header />

      {currentTab === TabEnum.appEdit ? (
        // 工具页同样依赖共享面板状态；隐藏 Builder 入口不影响节点列表和插件配置。
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
  );
};

const Render = () => {
  return (
    <ReactFlowCustomProvider templates={pluginSystemModuleTemplates}>
      <WorkflowEdit />
    </ReactFlowCustomProvider>
  );
};

export default Render;
