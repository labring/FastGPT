/**
 * Edge path generation algorithm adapted from ReactFlow
 * @see https://github.com/xyflow/xyflow
 * @license MIT - Copyright (c) 2019-2025 webkid GmbH
 */

import { type Node, Position, type XYPosition } from 'reactflow';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { IfElseResultEnum } from '@fastgpt/global/core/workflow/template/system/ifElse/constant';

// Get sort index from source node's output handle order
export const getHandleIndex = (
  edge: any,
  sourceNode: Node<FlowNodeItemType> | undefined
): number => {
  if (!sourceNode || !edge) return 0;

  const { flowNodeType, inputs } = sourceNode.data;
  const handleId = edge.sourceHandle || '';

  // userSelect: sort by option index
  if (flowNodeType === FlowNodeTypeEnum.userSelect) {
    const options = inputs?.find((i) => i.key === NodeInputKeyEnum.userSelectOptions)?.value;
    if (Array.isArray(options)) {
      const idx = options.findIndex((opt: any) => handleId.includes(opt.key));
      return idx >= 0 ? idx : 999;
    }
  }

  // ifElseNode: IF=0, ELSE IF=1/2/3..., ELSE=999
  if (flowNodeType === FlowNodeTypeEnum.ifElseNode) {
    if (handleId.includes(IfElseResultEnum.ELSE_IF)) {
      const match = handleId.match(/ELSE IF (\d+)/);
      return match ? parseInt(match[1]) : 1;
    }
    if (handleId.endsWith(`-${IfElseResultEnum.IF}`)) return 0;
    if (handleId.endsWith(`-${IfElseResultEnum.ELSE}`)) return 999;
  }

  // classifyQuestion: sort by agent index
  if (flowNodeType === FlowNodeTypeEnum.classifyQuestion) {
    const agents = inputs?.find((i) => i.key === NodeInputKeyEnum.agents)?.value;
    if (Array.isArray(agents)) {
      const idx = agents.findIndex((agent: any) => handleId.includes(agent.key));
      return idx >= 0 ? idx : 999;
    }
  }

  return 0;
};

export type PathParams = {
  sourceX: number;
  sourceY: number;
  sourcePosition?: Position;
  targetX: number;
  targetY: number;
  targetPosition?: Position;
  borderRadius?: number;
  offset?: number;
  stepOffset?: number;
};

// Handle 方向向量：定义各个方向的单位向量
const HANDLE_DIRECTIONS: Record<Position, XYPosition> = {
  [Position.Left]: { x: -1, y: 0 },
  [Position.Right]: { x: 1, y: 0 },
  [Position.Top]: { x: 0, y: -1 },
  [Position.Bottom]: { x: 0, y: 1 }
};

// 获取主方向（从源到目标）
const getDirection = ({
  source,
  sourcePosition = Position.Bottom,
  target
}: {
  source: XYPosition;
  sourcePosition: Position;
  target: XYPosition;
}): XYPosition => {
  if (sourcePosition === Position.Left || sourcePosition === Position.Right) {
    return source.x < target.x ? { x: 1, y: 0 } : { x: -1, y: 0 };
  }
  return source.y < target.y ? { x: 0, y: 1 } : { x: 0, y: -1 };
};

// 计算两点间的欧几里得距离
const getDistance = (a: XYPosition, b: XYPosition): number =>
  Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2));

/**
 * 生成圆角弯曲路径段
 * 在拐点处生成二次贝塞尔曲线，实现平滑圆角效果
 */
const getBend = (a: XYPosition, b: XYPosition, c: XYPosition, size: number): string => {
  const bendSize = Math.min(getDistance(a, b) / 2, getDistance(b, c) / 2, size);
  const { x, y } = b;

  // 三点共线，无需弯曲
  if ((a.x === x && x === c.x) || (a.y === y && y === c.y)) {
    return `L${x} ${y}`;
  }

  // 前一段是水平的
  if (a.y === y) {
    const xDir = a.x < c.x ? -1 : 1;
    const yDir = a.y < c.y ? 1 : -1;
    return `L ${x + bendSize * xDir},${y}Q ${x},${y} ${x},${y + bendSize * yDir}`;
  }

  // 前一段是垂直的
  const xDir = a.x < c.x ? 1 : -1;
  const yDir = a.y < c.y ? -1 : 1;
  return `L ${x},${y + bendSize * yDir}Q ${x},${y} ${x + bendSize * xDir},${y}`;
};

/**
 * 计算路径点
 * 参考 ReactFlow 的正交边路由算法，但使用 stepOffset（像素偏移）替代 stepPosition（比例值）
 */
const getPoints = ({
  source,
  sourcePosition = Position.Bottom,
  target,
  targetPosition = Position.Top,
  offset,
  stepOffset
}: {
  source: XYPosition;
  sourcePosition: Position;
  target: XYPosition;
  targetPosition: Position;
  offset: number;
  stepOffset: number;
}): [XYPosition[], number, number] => {
  const sourceDir = HANDLE_DIRECTIONS[sourcePosition];
  const targetDir = HANDLE_DIRECTIONS[targetPosition];

  // 从 handle 向外延伸一段距离
  const sourceGapped: XYPosition = {
    x: source.x + sourceDir.x * offset,
    y: source.y + sourceDir.y * offset
  };
  const targetGapped: XYPosition = {
    x: target.x + targetDir.x * offset,
    y: target.y + targetDir.y * offset
  };

  // 获取主方向
  const dir = getDirection({ source: sourceGapped, sourcePosition, target: targetGapped });
  const dirAccessor = dir.x !== 0 ? 'x' : 'y';
  const currDir = dir[dirAccessor];

  let points: XYPosition[] = [];
  let centerX: number;
  let centerY: number;

  const sourceGapOffset = { x: 0, y: 0 };
  const targetGapOffset = { x: 0, y: 0 };

  // 对向 handle（如 Right -> Left）
  if (sourceDir[dirAccessor] * targetDir[dirAccessor] === -1) {
    if (dirAccessor === 'x') {
      // 主方向是水平的，stepOffset 影响 X 坐标
      centerX = (sourceGapped.x + targetGapped.x) / 2 + stepOffset;
      centerY = (sourceGapped.y + targetGapped.y) / 2;
    } else {
      // 主方向是垂直的，stepOffset 影响 Y 坐标
      centerX = (sourceGapped.x + targetGapped.x) / 2;
      centerY = (sourceGapped.y + targetGapped.y) / 2 + stepOffset;
    }

    // 垂直分割路径（Z 型）
    const verticalSplit: XYPosition[] = [
      { x: centerX, y: sourceGapped.y },
      { x: centerX, y: targetGapped.y }
    ];

    // 水平分割路径（N 型）
    const horizontalSplit: XYPosition[] = [
      { x: sourceGapped.x, y: centerY },
      { x: targetGapped.x, y: centerY }
    ];

    if (sourceDir[dirAccessor] === currDir) {
      points = dirAccessor === 'x' ? verticalSplit : horizontalSplit;
    } else {
      points = dirAccessor === 'x' ? horizontalSplit : verticalSplit;
    }
  } else {
    // 同向或相邻 handle（如 Right -> Bottom）
    const sourceTarget: XYPosition[] = [{ x: sourceGapped.x, y: targetGapped.y }];
    const targetSource: XYPosition[] = [{ x: targetGapped.x, y: sourceGapped.y }];

    if (dirAccessor === 'x') {
      points = sourceDir.x === currDir ? targetSource : sourceTarget;
    } else {
      points = sourceDir.y === currDir ? sourceTarget : targetSource;
    }

    // 处理同向 handle 的特殊情况（如 Right -> Right）
    if (sourcePosition === targetPosition) {
      const diff = Math.abs(source[dirAccessor] - target[dirAccessor]);

      if (diff <= offset) {
        const gapOffset = Math.min(offset - 1, offset - diff);
        if (sourceDir[dirAccessor] === currDir) {
          sourceGapOffset[dirAccessor] =
            (sourceGapped[dirAccessor] > source[dirAccessor] ? -1 : 1) * gapOffset;
        } else {
          targetGapOffset[dirAccessor] =
            (targetGapped[dirAccessor] > target[dirAccessor] ? -1 : 1) * gapOffset;
        }
      }
    }

    // 处理相邻 handle 的特殊情况（如 Right -> Bottom）
    if (sourcePosition !== targetPosition) {
      const dirAccessorOpposite = dirAccessor === 'x' ? 'y' : 'x';
      const isSameDir = sourceDir[dirAccessor] === targetDir[dirAccessorOpposite];
      const sourceGtTargetOppo =
        sourceGapped[dirAccessorOpposite] > targetGapped[dirAccessorOpposite];
      const sourceLtTargetOppo =
        sourceGapped[dirAccessorOpposite] < targetGapped[dirAccessorOpposite];
      const flipSourceTarget =
        (sourceDir[dirAccessor] === 1 &&
          ((!isSameDir && sourceGtTargetOppo) || (isSameDir && sourceLtTargetOppo))) ||
        (sourceDir[dirAccessor] !== 1 &&
          ((!isSameDir && sourceLtTargetOppo) || (isSameDir && sourceGtTargetOppo)));

      if (flipSourceTarget) {
        points = dirAccessor === 'x' ? sourceTarget : targetSource;
      }
    }

    // 计算标签位置（放在最长线段的中点）
    const sourceGapPoint = {
      x: sourceGapped.x + sourceGapOffset.x,
      y: sourceGapped.y + sourceGapOffset.y
    };
    const targetGapPoint = {
      x: targetGapped.x + targetGapOffset.x,
      y: targetGapped.y + targetGapOffset.y
    };
    const maxXDistance = Math.max(
      Math.abs(sourceGapPoint.x - points[0].x),
      Math.abs(targetGapPoint.x - points[0].x)
    );
    const maxYDistance = Math.max(
      Math.abs(sourceGapPoint.y - points[0].y),
      Math.abs(targetGapPoint.y - points[0].y)
    );

    if (maxXDistance >= maxYDistance) {
      centerX = (sourceGapPoint.x + targetGapPoint.x) / 2;
      centerY = points[0].y;
    } else {
      centerX = points[0].x;
      centerY = (sourceGapPoint.y + targetGapPoint.y) / 2;
    }
  }

  // 构建完整路径点数组
  const pathPoints = [
    source,
    { x: sourceGapped.x + sourceGapOffset.x, y: sourceGapped.y + sourceGapOffset.y },
    ...points,
    { x: targetGapped.x + targetGapOffset.x, y: targetGapped.y + targetGapOffset.y },
    target
  ];

  return [pathPoints, centerX, centerY];
};

/**
 * 自定义阶梯路径生成函数
 * 参考 ReactFlow 的 getSmoothStepPath，但使用 stepOffset（像素偏移）替代 stepPosition（比例值）
 * @returns [路径字符串, 标签X坐标, 标签Y坐标]
 */
export const getCustomStepPath = ({
  sourceX,
  sourceY,
  sourcePosition = Position.Bottom,
  targetX,
  targetY,
  targetPosition = Position.Top,
  borderRadius = 5,
  offset = 20,
  stepOffset = 0
}: PathParams): [path: string, labelX: number, labelY: number] => {
  const [points, labelX, labelY] = getPoints({
    source: { x: sourceX, y: sourceY },
    sourcePosition,
    target: { x: targetX, y: targetY },
    targetPosition,
    offset,
    stepOffset
  });

  // 将点数组转换为 SVG 路径字符串
  const path = points.reduce<string>((res, p, i) => {
    let segment = '';

    if (i > 0 && i < points.length - 1) {
      segment = getBend(points[i - 1], p, points[i + 1], borderRadius);
    } else {
      segment = `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`;
    }

    res += segment;
    return res;
  }, '');

  return [path, labelX, labelY];
};
