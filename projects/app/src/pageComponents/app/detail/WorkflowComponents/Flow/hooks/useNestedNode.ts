import { useContext } from 'react';
import { useWorkflowCanvasValue } from '../canvas/workflowCanvasContext';
import { WorkflowNodeOffscreenMeasurementContext } from '../nodes/render/Handle/handleRenderContext';

/** 读取容器派生尺寸；离屏测量时保留容器自身内容的自然高度和宽度。 */
export const useNestedNode = (nodeId: string) => {
  const layout = useWorkflowCanvasValue((value) => value.containerLayouts.get(nodeId));
  const isMeasurement = useContext(WorkflowNodeOffscreenMeasurementContext);

  return {
    nodeWidth: isMeasurement ? 0 : (layout?.childWidth ?? 0),
    nodeHeight: isMeasurement ? 0 : (layout?.childHeight ?? 0)
  };
};
