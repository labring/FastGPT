import React, { useMemo } from 'react';
import { AppSchema } from '@fastgpt/global/core/app/type.d';
import Header from './Header';
import Flow from '@/components/core/module/Flow';
import FlowProvider, { useFlowProviderStore } from '@/components/core/module/Flow/FlowProvider';
import { SystemModuleTemplateType } from '@fastgpt/global/core/module/type.d';
import { SystemModuleTemplates } from '@/constants/flow/ModuleTemplate';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { usePluginStore } from '@/web/core/plugin/store/plugin';
import { useQuery } from '@tanstack/react-query';

type Props = { app: AppSchema; onClose: () => void };

const Render = ({ app, onClose }: Props) => {
  const { nodes } = useFlowProviderStore();
  const { pluginModuleTemplates, loadPluginModuleTemplates } = usePluginStore();

  const filterTemplates = useMemo(() => {
    const copyTemplates: SystemModuleTemplateType = JSON.parse(
      JSON.stringify(SystemModuleTemplates)
    );
    const filterType: Record<string, 1> = {
      [FlowNodeTypeEnum.userGuide]: 1
    };
    // filter some template
    nodes.forEach((node) => {
      if (node.type && filterType[node.type]) {
        copyTemplates.forEach((item) => {
          item.list.forEach((module, index) => {
            if (module.flowType === node.type) {
              item.list.splice(index, 1);
            }
          });
        });
      }
    });

    return copyTemplates;
  }, [nodes]);

  useQuery(['getUserPlugs2ModuleTemplates'], () => loadPluginModuleTemplates());

  return (
    <Flow
      systemTemplates={filterTemplates}
      pluginTemplates={[{ label: '', list: pluginModuleTemplates }]}
      show2Plugin
      modules={app.modules}
      Header={<Header app={app} onClose={onClose} />}
    />
  );
};

export default React.memo(function AdEdit(props: Props) {
  return (
    <FlowProvider filterAppIds={[props.app._id]}>
      <Render {...props} />
    </FlowProvider>
  );
});
