import React from 'react';
import { appSystemModuleTemplates } from '@fastgpt/global/core/workflow/template/constants';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { v1Workflow2V2 } from '@/web/core/workflow/adapt';

import { useContextSelector } from 'use-context-selector';
import { AppContext, TabEnum } from '../context';
import { useMount } from 'ahooks';
import Header from './Header';
import { Flex } from '@chakra-ui/react';
import { workflowBoxStyles } from '../constants';
import dynamic from 'next/dynamic';
import { cloneDeep } from 'lodash';
import { useTranslation } from 'next-i18next';

import Flow from '../WorkflowComponents/Flow';
import { ReactFlowCustomProvider } from '../WorkflowComponents/context/index';
import { WorkflowUtilsContext } from '../WorkflowComponents/context/workflowUtilsContext';

const Logs = dynamic(() => import('../Logs/index'));
const PublishChannel = dynamic(() => import('../Publish'));

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

  useMount(() => {
    if (!isV2Workflow) {
      openConfirm(() => {
        initData(JSON.parse(JSON.stringify(v1Workflow2V2((appDetail.modules || []) as any))), true);
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
        <Flow />
      ) : (
        <Flex flexDirection={'column'} h={'100%'} px={4} pb={4}>
          {currentTab === TabEnum.publish && <PublishChannel />}
          {currentTab === TabEnum.logs && <Logs />}
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
