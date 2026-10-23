import type { Connection, Edge } from 'reactflow';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';

/** 在提交新连接前检查互斥关系；冲突只返回原因，由用户显式删除旧连线。 */
export const getConnectionConflict = (connection: Connection, edges: Edge[]) => {
  if (connection.source === connection.target) return 'self';
  if (
    connection.sourceHandle === NodeOutputKeyEnum.selectedTools &&
    edges.some(
      (edge) =>
        edge.target === connection.target && edge.targetHandle !== NodeOutputKeyEnum.selectedTools
    )
  ) {
    return 'tool-target-has-normal-edges';
  }
};
