import React, { useEffect, useMemo } from 'react';
import { AppSchema } from '@fastgpt/global/core/app/type.d';
import Header from './Header';
import Flow from '@/components/core/module/Flow';
import FlowProvider, { useFlowProviderStore } from '@/components/core/module/Flow/FlowProvider';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/module/type.d';
import { appSystemModuleTemplates } from '@fastgpt/global/core/module/template/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { useWorkflowStore } from '@/web/core/workflow/store/workflow';

type Props = { app: AppSchema; onClose: () => void };

const Render = ({ app, onClose }: Props) => {
  const { nodes, initData } = useFlowProviderStore();
  const { setBasicNodeTemplates } = useWorkflowStore();

  useEffect(() => {
    initData(JSON.parse(JSON.stringify(app.modules)));
  }, [app.modules]);

  useEffect(() => {
    const concatTemplates = [...appSystemModuleTemplates];

    const copyTemplates: FlowNodeTemplateType[] = JSON.parse(JSON.stringify(concatTemplates));

    const filterType: Record<string, 1> = {
      [FlowNodeTypeEnum.userGuide]: 1
    };

    // filter some template, There can only be one
    nodes.forEach((node) => {
      if (node.type && filterType[node.type]) {
        copyTemplates.forEach((module, index) => {
          if (module.flowType === node.type) {
            copyTemplates.splice(index, 1);
          }
        });
      }
    });

    setBasicNodeTemplates(copyTemplates);
  }, [nodes, setBasicNodeTemplates]);

  const memoRender = useMemo(() => {
    return <Flow Header={<Header app={app} onClose={onClose} />} />;
  }, [app, onClose]);

  return memoRender;
};

export default React.memo(function FlowEdit(props: Props) {
  const filterAppIds = useMemo(() => [props.app._id], [props.app._id]);

  return (
    <FlowProvider mode={'app'} filterAppIds={filterAppIds}>
      <Render {...props} />
    </FlowProvider>
  );
});
