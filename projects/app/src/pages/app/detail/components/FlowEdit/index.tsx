import React, { useEffect, useMemo } from 'react';
import { AppSchema } from '@fastgpt/global/core/app/type.d';
import Header from './Header';
import Flow from '@/components/core/workflow/Flow';
import FlowProvider, { useFlowProviderStore } from '@/components/core/workflow/Flow/FlowProvider';
import { appSystemModuleTemplates } from '@fastgpt/global/core/workflow/template/constants';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { v1Workflow2V2 } from '@/web/core/workflow/adapt';

type Props = { app: AppSchema; onClose: () => void };

const Render = ({ app, onClose }: Props) => {
  const isV2Workflow = app?.version === 'v2';
  const { openConfirm, ConfirmModal } = useConfirm({
    showCancel: false,
    content:
      '检测到您的高级编排为旧版，系统将为您自动格式化成新版工作流。\n\n由于版本差异较大，会导致许多工作流无法正常排布，请重新手动连接工作流。如仍异常，可尝试删除对应节点后重新添加。\n\n你可以直接点击测试进行调试，无需点击保存，点击保存为新版工作流。'
  });

  const { initData } = useFlowProviderStore();

  useEffect(() => {
    if (!isV2Workflow) return;
    initData(
      JSON.parse(
        JSON.stringify({
          nodes: app.modules || [],
          edges: app.edges || []
        })
      )
    );
  }, [isV2Workflow, app.edges, app.modules]);

  useEffect(() => {
    if (!isV2Workflow) {
      openConfirm(() => {
        initData(JSON.parse(JSON.stringify(v1Workflow2V2((app.modules || []) as any))));
      })();
    }
  }, [app.modules, isV2Workflow, openConfirm]);

  const memoRender = useMemo(() => {
    return <Flow Header={<Header app={app} onClose={onClose} />} />;
  }, [app, onClose]);

  return (
    <>
      {memoRender}
      {!isV2Workflow && <ConfirmModal countDown={0} />}
    </>
  );
};

export default React.memo(function FlowEdit(props: Props) {
  const filterAppIds = useMemo(() => [props.app._id], [props.app._id]);

  return (
    <FlowProvider
      appId={props.app._id}
      mode={'app'}
      filterAppIds={filterAppIds}
      basicNodeTemplates={appSystemModuleTemplates}
    >
      <Render {...props} />
    </FlowProvider>
  );
});
