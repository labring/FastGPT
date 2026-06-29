import React from 'react';
import { appSystemModuleTemplates } from '@fastgpt/global/core/workflow/template/constants';

import { useContextSelector } from 'use-context-selector';
import { AppContext, TabEnum } from '../context';
import { useMount } from 'ahooks';
import Header from './Header';
import { Flex } from '@chakra-ui/react';
import { workflowBoxStyles } from '../constants';
import dynamic from 'next/dynamic';
import { cloneDeep } from 'lodash';

import Flow from '../WorkflowComponents/Flow';
import { ReactFlowCustomProvider } from '../WorkflowComponents/context/index';
import { WorkflowUtilsContext } from '../WorkflowComponents/context/workflowUtilsContext';

const Logs = dynamic(() => import('../Logs/index'));
const PublishChannel = dynamic(() => import('../Publish'));

const WorkflowEdit = () => {
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const currentTab = useContextSelector(AppContext, (v) => v.currentTab);

  const initData = useContextSelector(WorkflowUtilsContext, (v) => v.initData);

  useMount(() => {
    initData(
      cloneDeep({
        nodes: appDetail.modules || [],
        edges: appDetail.edges || []
      }),
      true
    );
  });

  return (
    <Flex {...workflowBoxStyles}>
      <Header />

      {currentTab === TabEnum.appEdit ? (
        <Flow />
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
    <ReactFlowCustomProvider templates={appSystemModuleTemplates}>
      <WorkflowEdit />
    </ReactFlowCustomProvider>
  );
};

export default Render;
