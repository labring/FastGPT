import React, { useEffect } from 'react';
import ReactFlow, { Background, ReactFlowProvider, useNodesState } from 'reactflow';
import { FlowModuleItemType, ModuleItemType } from '@fastgpt/global/core/module/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';
import dynamic from 'next/dynamic';
import { formatPluginIOModules } from '@fastgpt/global/core/module/utils';
import MyModal from '@/components/MyModal';
import { Box } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { PluginItemSchema } from '@fastgpt/global/core/plugin/type';
import { appModule2FlowNode } from '@/utils/adapt';

const nodeTypes = {
  [FlowNodeTypeEnum.pluginModule]: dynamic(
    () => import('@/components/core/module/Flow/components/nodes/NodePreviewPlugin')
  )
};

const PreviewPlugin = ({
  plugin,
  modules,
  onClose
}: {
  plugin: PluginItemSchema;
  modules: ModuleItemType[];
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const [nodes = [], setNodes, onNodesChange] = useNodesState<FlowModuleItemType>([]);

  useEffect(() => {
    setNodes([
      appModule2FlowNode({
        item: {
          moduleId: 'plugin',
          flowType: FlowNodeTypeEnum.pluginModule,
          logo: plugin.avatar,
          name: plugin.name,
          description: plugin.intro,
          intro: plugin.intro,
          ...formatPluginIOModules(plugin._id, modules)
        }
      })
    ]);
  }, [modules, plugin, setNodes]);

  return (
    <MyModal isOpen title={t('module.Preview Plugin')} onClose={onClose} isCentered>
      <Box h={'400px'} w={'400px'}>
        <ReactFlowProvider>
          <ReactFlow
            fitView
            nodes={nodes}
            edges={[]}
            minZoom={0.1}
            maxZoom={1.5}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
          >
            <Background />
          </ReactFlow>
        </ReactFlowProvider>
      </Box>
    </MyModal>
  );
};

export default React.memo(PreviewPlugin);
