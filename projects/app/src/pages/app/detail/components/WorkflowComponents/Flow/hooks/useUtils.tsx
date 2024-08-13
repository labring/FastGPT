import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../context';
import { useTranslation } from 'next-i18next';
import { useCallback } from 'react';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { Node, NodePositionChange, XYPosition } from 'reactflow';
import { THelperLine } from '@fastgpt/global/core/workflow/type';

type GetHelperLinesResult = {
  horizontal?: THelperLine;
  vertical?: THelperLine;
  snapPosition: Partial<XYPosition>;
};

export const useWorkflowUtils = () => {
  const { t } = useTranslation();
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);

  const computedNewNodeName = useCallback(
    ({
      templateName,
      flowNodeType,
      pluginId
    }: {
      templateName: string;
      flowNodeType: FlowNodeTypeEnum;
      pluginId?: string;
    }) => {
      const nodeLength = nodeList.filter((node) => {
        if (node.flowNodeType === flowNodeType) {
          if (node.flowNodeType === FlowNodeTypeEnum.pluginModule) {
            return node.pluginId === pluginId;
          } else {
            return true;
          }
        }
      }).length;
      return nodeLength > 0 ? `${templateName}#${nodeLength + 1}` : templateName;
    },
    [nodeList]
  );

  const getHelperLines = (
    change: NodePositionChange,
    nodes: Node[],
    distance = 8
  ): GetHelperLinesResult => {
    const nodeA = nodes.find((node) => node.id === change.id);

    if (!nodeA || !change.position) {
      return {
        horizontal: undefined,
        vertical: undefined,
        snapPosition: { x: undefined, y: undefined }
      };
    }

    const nodeABounds = {
      left: change.position.x,
      right: change.position.x + (nodeA.width ?? 0),
      top: change.position.y,
      bottom: change.position.y + (nodeA.height ?? 0),
      width: nodeA.width ?? 0,
      height: nodeA.height ?? 0,
      centerX: change.position.x + (nodeA.width ?? 0) / 2,
      centerY: change.position.y + (nodeA.height ?? 0) / 2
    };

    let horizontalDistance = distance;
    let verticalDistance = distance;

    return nodes
      .filter((node) => node.id !== nodeA.id)
      .reduce<GetHelperLinesResult>(
        (result, nodeB) => {
          if (!result.vertical) {
            result.vertical = {
              position: nodeABounds.centerX,
              nodes: []
            };
          }

          if (!result.horizontal) {
            result.horizontal = {
              position: nodeABounds.centerY,
              nodes: []
            };
          }

          const nodeBBounds = {
            left: nodeB.position.x,
            right: nodeB.position.x + (nodeB.width ?? 0),
            top: nodeB.position.y,
            bottom: nodeB.position.y + (nodeB.height ?? 0),
            width: nodeB.width ?? 0,
            height: nodeB.height ?? 0,
            centerX: nodeB.position.x + (nodeB.width ?? 0) / 2,
            centerY: nodeB.position.y + (nodeB.height ?? 0) / 2
          };

          const distanceLeftLeft = Math.abs(nodeABounds.left - nodeBBounds.left);
          const distanceRightRight = Math.abs(nodeABounds.right - nodeBBounds.right);
          const distanceLeftRight = Math.abs(nodeABounds.left - nodeBBounds.right);
          const distanceRightLeft = Math.abs(nodeABounds.right - nodeBBounds.left);
          const distanceTopTop = Math.abs(nodeABounds.top - nodeBBounds.top);
          const distanceBottomTop = Math.abs(nodeABounds.bottom - nodeBBounds.top);
          const distanceBottomBottom = Math.abs(nodeABounds.bottom - nodeBBounds.bottom);
          const distanceTopBottom = Math.abs(nodeABounds.top - nodeBBounds.bottom);
          const distanceCenterXCenterX = Math.abs(nodeABounds.centerX - nodeBBounds.centerX);
          const distanceCenterYCenterY = Math.abs(nodeABounds.centerY - nodeBBounds.centerY);

          //  |‾‾‾‾‾‾‾‾‾‾‾|
          //  |     A     |
          //  |___________|
          //  |
          //  |
          //  |‾‾‾‾‾‾‾‾‾‾‾|
          //  |     B     |
          //  |___________|
          if (distanceLeftLeft < verticalDistance) {
            result.snapPosition.x = nodeBBounds.left;
            result.vertical.position = nodeBBounds.left;
            result.vertical.nodes = [nodeABounds, nodeBBounds];
            verticalDistance = distanceLeftLeft;
          } else if (distanceLeftLeft === verticalDistance) {
            result.vertical.nodes.push(nodeBBounds);
          }

          //  |‾‾‾‾‾‾‾‾‾‾‾|
          //  |     A     |
          //  |___________|
          //              |
          //              |
          //  |‾‾‾‾‾‾‾‾‾‾‾|
          //  |     B     |
          //  |___________|
          if (distanceRightRight < verticalDistance) {
            result.snapPosition.x = nodeBBounds.right - nodeABounds.width;
            result.vertical.position = nodeBBounds.right;
            result.vertical.nodes = [nodeABounds, nodeBBounds];
            verticalDistance = distanceRightRight;
          } else if (distanceRightRight === verticalDistance) {
            result.vertical.nodes.push(nodeBBounds);
          }

          //              |‾‾‾‾‾‾‾‾‾‾‾|
          //              |     A     |
          //              |___________|
          //              |
          //              |
          //  |‾‾‾‾‾‾‾‾‾‾‾|
          //  |     B     |
          //  |___________|
          if (distanceLeftRight < verticalDistance) {
            result.snapPosition.x = nodeBBounds.right;
            result.vertical.position = nodeBBounds.right;
            result.vertical.nodes = [nodeABounds, nodeBBounds];
            verticalDistance = distanceLeftRight;
          } else if (distanceLeftRight === verticalDistance) {
            result.vertical.nodes.push(nodeBBounds);
          }

          //  |‾‾‾‾‾‾‾‾‾‾‾|
          //  |     A     |
          //  |___________|
          //              |
          //              |
          //              |‾‾‾‾‾‾‾‾‾‾‾|
          //              |     B     |
          //              |___________|
          if (distanceRightLeft < verticalDistance) {
            result.snapPosition.x = nodeBBounds.left - nodeABounds.width;
            result.vertical.position = nodeBBounds.left;
            result.vertical.nodes = [nodeABounds, nodeBBounds];
            verticalDistance = distanceRightLeft;
          } else if (distanceRightLeft === verticalDistance) {
            result.vertical.nodes.push(nodeBBounds);
          }

          //  |‾‾‾‾‾‾‾‾‾‾‾|‾‾‾‾‾|‾‾‾‾‾‾‾‾‾‾‾|
          //  |     A     |     |     B     |
          //  |___________|     |___________|
          if (distanceTopTop < horizontalDistance) {
            result.snapPosition.y = nodeBBounds.top;
            result.horizontal.position = nodeBBounds.top;
            result.horizontal.nodes = [nodeABounds, nodeBBounds];
            horizontalDistance = distanceTopTop;
          } else if (distanceTopTop === horizontalDistance) {
            result.horizontal.nodes.push(nodeBBounds);
          }

          //  |‾‾‾‾‾‾‾‾‾‾‾|
          //  |     A     |
          //  |___________|_________________
          //                    |           |
          //                    |     B     |
          //                    |___________|
          if (distanceBottomTop < horizontalDistance) {
            result.snapPosition.y = nodeBBounds.top - nodeABounds.height;
            result.horizontal.position = nodeBBounds.top;
            result.horizontal.nodes = [nodeABounds, nodeBBounds];
            horizontalDistance = distanceBottomTop;
          } else if (distanceBottomTop === horizontalDistance) {
            result.horizontal.nodes.push(nodeBBounds);
          }

          //  |‾‾‾‾‾‾‾‾‾‾‾|     |‾‾‾‾‾‾‾‾‾‾‾|
          //  |     A     |     |     B     |
          //  |___________|_____|___________|
          if (distanceBottomBottom < horizontalDistance) {
            result.snapPosition.y = nodeBBounds.bottom - nodeABounds.height;
            result.horizontal.position = nodeBBounds.bottom;
            result.horizontal.nodes = [nodeABounds, nodeBBounds];
            horizontalDistance = distanceBottomBottom;
          } else if (distanceBottomBottom === horizontalDistance) {
            result.horizontal.nodes.push(nodeBBounds);
          }

          //                    |‾‾‾‾‾‾‾‾‾‾‾|
          //                    |     B     |
          //                    |           |
          //  |‾‾‾‾‾‾‾‾‾‾‾|‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾
          //  |     A     |
          //  |___________|
          if (distanceTopBottom < horizontalDistance) {
            result.snapPosition.y = nodeBBounds.bottom;
            result.horizontal.position = nodeBBounds.bottom;
            result.horizontal.nodes = [nodeABounds, nodeBBounds];
            horizontalDistance = distanceTopBottom;
          } else if (distanceTopBottom === horizontalDistance) {
            result.horizontal.nodes.push(nodeBBounds);
          }

          //  |‾‾‾‾‾‾‾‾‾‾‾|
          //  |     A     |
          //  |___________|
          //        |
          //        |
          //  |‾‾‾‾‾‾‾‾‾‾‾|
          //  |     B     |
          //  |___________|
          if (distanceCenterXCenterX < verticalDistance) {
            result.snapPosition.x = nodeBBounds.centerX - nodeABounds.width / 2;
            result.vertical.position = nodeBBounds.centerX;
            result.vertical.nodes = [nodeABounds, nodeBBounds];
            verticalDistance = distanceCenterXCenterX;
          } else if (distanceCenterXCenterX === verticalDistance) {
            result.vertical.nodes.push(nodeBBounds);
          }

          //  |‾‾‾‾‾‾‾‾‾‾‾|    |‾‾‾‾‾‾‾‾‾‾‾|
          //  |     A     |----|     B     |
          //  |___________|    |___________|
          if (distanceCenterYCenterY < horizontalDistance) {
            result.snapPosition.y = nodeBBounds.centerY - nodeABounds.height / 2;
            result.horizontal.position = nodeBBounds.centerY;
            result.horizontal.nodes = [nodeABounds, nodeBBounds];
            horizontalDistance = distanceCenterYCenterY;
          } else if (distanceCenterYCenterY === horizontalDistance) {
            result.horizontal.nodes.push(nodeBBounds);
          }

          return result;
        },
        { snapPosition: { x: undefined, y: undefined } } as GetHelperLinesResult
      );
  };

  return {
    computedNewNodeName,
    getHelperLines
  };
};

export default function Dom() {
  return <></>;
}
