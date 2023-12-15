import { FlowNodeOutputTargetItemType } from '@fastgpt/global/core/module/node/type';
import { FlowModuleItemType, ModuleItemType } from '@fastgpt/global/core/module/type';
import { type Node, type Edge } from 'reactflow';

export function flowNode2Modules({
  nodes,
  edges
}: {
  nodes: Node<FlowModuleItemType, string | undefined>[];
  edges: Edge<any>[];
}) {
  const modules: ModuleItemType[] = nodes.map((item) => ({
    moduleId: item.data.moduleId,
    name: item.data.name,
    avatar: item.data.avatar,
    flowType: item.data.flowType,
    showStatus: item.data.showStatus,
    position: item.position,
    inputs: item.data.inputs.map((input) => ({
      ...input,
      connected: false
    })),
    outputs: item.data.outputs.map((item) => ({
      ...item,
      targets: [] as FlowNodeOutputTargetItemType[]
    }))
  }));

  // update inputs and outputs
  modules.forEach((module) => {
    module.inputs.forEach((input) => {
      input.connected = !!edges.find(
        (edge) => edge.target === module.moduleId && edge.targetHandle === input.key
      );
    });

    module.outputs.forEach((output) => {
      output.targets = edges
        .filter(
          (edge) =>
            edge.source === module.moduleId && edge.sourceHandle === output.key && edge.targetHandle
        )
        .map((edge) => ({
          moduleId: edge.target,
          key: edge.targetHandle || ''
        }));
    });
  });

  return modules;
}
