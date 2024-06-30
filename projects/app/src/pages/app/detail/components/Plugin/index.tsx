import React from 'react';
import { pluginSystemModuleTemplates } from '@fastgpt/global/core/workflow/template/constants';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { v1Workflow2V2 } from '@/web/core/workflow/adapt';
import WorkflowContextProvider, { WorkflowContext } from '../WorkflowComponents/context';
import { useContextSelector } from 'use-context-selector';
import { AppContext, TabEnum } from '../context';
import { useMount } from 'ahooks';
import Header from './Header';
import { Flex } from '@chakra-ui/react';
import { workflowBoxStyles } from '../constants';
import dynamic from 'next/dynamic';
import { cloneDeep } from 'lodash';

import Flow from '../WorkflowComponents/Flow';
const Logs = dynamic(() => import('../Logs/index'));
const PublishChannel = dynamic(() => import('../Publish'));

const WorkflowEdit = () => {
  const { appDetail, currentTab } = useContextSelector(AppContext, (e) => e);
  const isV2Workflow = appDetail?.version === 'v2';

  const { openConfirm, ConfirmModal } = useConfirm({
    showCancel: false,
    content:
      '检测到您的高级编排为旧版，系统将为您自动格式化成新版工作流。\n\n由于版本差异较大，会导致一些工作流无法正常排布，请重新手动连接工作流。如仍异常，可尝试删除对应节点后重新添加。\n\n你可以直接点击调试进行工作流测试，调试完毕后点击发布。直到你点击发布，新工作流才会真正保存生效。\n\n在你发布新工作流前，自动保存不会生效。'
  });

  const initData = useContextSelector(WorkflowContext, (v) => v.initData);

  useMount(() => {
    if (!isV2Workflow) {
      openConfirm(() => {
        initData(JSON.parse(JSON.stringify(v1Workflow2V2((appDetail.modules || []) as any))));
      })();
    } else {
      initData(
        cloneDeep({
          nodes: appDetail.modules || [],
          edges: appDetail.edges || []
        })
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
    <WorkflowContextProvider basicNodeTemplates={pluginSystemModuleTemplates}>
      <WorkflowEdit />
    </WorkflowContextProvider>
  );
};

export default React.memo(Render);
