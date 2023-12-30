import React, { useEffect, useMemo } from 'react';
import { AppSchema } from '@fastgpt/global/core/app/type.d';
import Header from './Header';
import Flow from '@/components/core/module/Flow';
import FlowProvider, { useFlowProviderStore } from '@/components/core/module/Flow/FlowProvider';
import type { FlowModuleTemplateType } from '@fastgpt/global/core/module/type.d';
import { appSystemModuleTemplates } from '@/web/core/modules/template/system';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { usePluginStore } from '@/web/core/plugin/store/plugin';
import { useQuery } from '@tanstack/react-query';

type Props = { app: AppSchema; onClose: () => void };

const Render = ({ app, onClose }: Props) => {
  const { nodes, initData } = useFlowProviderStore();
  const { pluginModuleTemplates, loadPluginTemplates } = usePluginStore();

  const moduleTemplates = useMemo(() => {
    const concatTemplates = [...appSystemModuleTemplates, ...pluginModuleTemplates];

    const copyTemplates: FlowModuleTemplateType[] = JSON.parse(JSON.stringify(concatTemplates));

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

    return copyTemplates;
  }, [nodes, pluginModuleTemplates]);

  useQuery(['getPlugTemplates'], () => loadPluginTemplates());

  useEffect(() => {
    initData(JSON.parse(JSON.stringify(app.modules)));
  }, [app.modules]);

  return <Flow templates={moduleTemplates} Header={<Header app={app} onClose={onClose} />} />;
};

export default React.memo(function FlowEdit(props: Props) {
  return (
    <FlowProvider mode={'app'} filterAppIds={[props.app._id]}>
      <Render {...props} />
    </FlowProvider>
  );
});
