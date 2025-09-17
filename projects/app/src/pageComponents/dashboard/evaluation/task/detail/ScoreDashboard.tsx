import React from 'react';
import { Box, Flex } from '@chakra-ui/react';

interface ScoreDashboardProps {
  threshold: number;
  actualScore: number;
  maxScore?: number;
  size?: number;
}

const ScoreDashboard: React.FC<ScoreDashboardProps> = ({
  threshold,
  actualScore,
  maxScore = 100,
  size = 140
}) => {
  // 判断实际分数是否达到阈值
  const isAboveThreshold = actualScore >= threshold;

  const scoreColor = isAboveThreshold ? '#3370FF' : '#FDB022';

  // 计算角度（半圆形，180度），映射到上半圆
  // 0分对应180度（9点钟），100分对应0度（3点钟）
  const thresholdAngle = 180 - Math.min(Math.max((threshold / maxScore) * 180, 0), 180);
  const actualScoreAngle = 180 - Math.min(Math.max((actualScore / maxScore) * 180, 0), 180);

  // 圆环参数
  const centerX = size / 2;
  const centerY = size / 2;
  const outerRadius = size / 2 - 8;
  const outerInnerRadius = outerRadius - 24; // 外环宽度为24px
  const innerOuterRadius = outerInnerRadius - 8; // 内外环间隔8px
  const innerInnerRadius = innerOuterRadius - 12; // 内环宽度为12px

  // 创建上半圆弧路径（从9点钟到3点钟）
  const createSemiCirclePath = (outerR: number, innerR: number) => {
    return `M ${centerX - outerR} ${centerY} 
            A ${outerR} ${outerR} 0 0 1 ${centerX + outerR} ${centerY}
            L ${centerX + innerR} ${centerY}
            A ${innerR} ${innerR} 0 0 0 ${centerX - innerR} ${centerY} Z`;
  };

  // 创建弧形路径
  const createArcPath = (startAngle: number, endAngle: number, outerR: number, innerR: number) => {
    // 确保角度在有效范围内
    const clampedStartAngle = Math.min(Math.max(startAngle, 0), 180);
    const clampedEndAngle = Math.min(Math.max(endAngle, 0), 180);

    if (clampedStartAngle >= clampedEndAngle) return '';

    // 转换为弧度，0度对应3点钟方向
    const startRad = clampedStartAngle * (Math.PI / 180);
    const endRad = clampedEndAngle * (Math.PI / 180);

    const x1 = centerX + outerR * Math.cos(startRad);
    const y1 = centerY - outerR * Math.sin(startRad); // 注意这里是减号，因为SVG的Y轴向下
    const x2 = centerX + outerR * Math.cos(endRad);
    const y2 = centerY - outerR * Math.sin(endRad);

    const x3 = centerX + innerR * Math.cos(endRad);
    const y3 = centerY - innerR * Math.sin(endRad);
    const x4 = centerX + innerR * Math.cos(startRad);
    const y4 = centerY - innerR * Math.sin(startRad);

    const largeArcFlag = clampedEndAngle - clampedStartAngle > 180 ? 1 : 0;

    return `M ${x1} ${y1} 
            A ${outerR} ${outerR} 0 ${largeArcFlag} 0 ${x2} ${y2}
            L ${x3} ${y3}
            A ${innerR} ${innerR} 0 ${largeArcFlag} 1 ${x4} ${y4} Z`;
  };

  // 创建等边三角形指针路径
  const createTrianglePointerPath = (angle: number) => {
    const clampedAngle = Math.min(Math.max(angle, 0), 180);
    const angleRad = clampedAngle * (Math.PI / 180);

    const sideLength = 10;

    // 三角形顶点距离黄色和蓝色填充2px
    // 黄色和蓝色填充的内边缘位置是 outerRadius - 18
    const tipRadius = outerRadius - 18 - 2;
    const tipX = centerX + tipRadius * Math.cos(angleRad);
    const tipY = centerY - tipRadius * Math.sin(angleRad);

    // 底边中点位置（在内层圆环中间）
    const baseRadius = (innerOuterRadius + innerInnerRadius) / 2;

    // 判断是否需要限制底边位置
    const score7Angle = 180 - (7 / maxScore) * 180; // 分数7对应的角度
    const score93Angle = 180 - (93 / maxScore) * 180; // 分数93对应的角度

    let baseCenterX, baseCenterY;

    if (actualScore < 7) {
      // 分数小于7时，底边固定在分数7的位置
      const fixedAngleRad = score7Angle * (Math.PI / 180);
      baseCenterX = centerX + baseRadius * Math.cos(fixedAngleRad);
      baseCenterY = centerY - baseRadius * Math.sin(fixedAngleRad);
    } else if (actualScore > 93) {
      // 分数大于93时，底边固定在分数93的位置
      const fixedAngleRad = score93Angle * (Math.PI / 180);
      baseCenterX = centerX + baseRadius * Math.cos(fixedAngleRad);
      baseCenterY = centerY - baseRadius * Math.sin(fixedAngleRad);
    } else {
      // 正常情况下，底边跟随实际分数角度
      baseCenterX = centerX + baseRadius * Math.cos(angleRad);
      baseCenterY = centerY - baseRadius * Math.sin(angleRad);
    }

    const halfSide = sideLength / 2;
    const baseAngleRad = Math.atan2(centerY - baseCenterY, baseCenterX - centerX);
    const leftX = baseCenterX + halfSide * Math.cos(baseAngleRad + Math.PI / 2);
    const leftY = baseCenterY + halfSide * Math.sin(baseAngleRad + Math.PI / 2);
    const rightX = baseCenterX + halfSide * Math.cos(baseAngleRad - Math.PI / 2);
    const rightY = baseCenterY + halfSide * Math.sin(baseAngleRad - Math.PI / 2);

    return `M ${tipX} ${tipY} L ${leftX} ${leftY} L ${rightX} ${rightY} Z`;
  };

  return (
    <Flex flexDirection={'column'} alignItems={'center'}>
      <Box position={'relative'} w={`${size}px`} h={`${size / 2 + 30}px`}>
        <svg width={size} height={size / 2 + 30} style={{ overflow: 'visible' }}>
          {/* 外层背景半圆 */}
          <path d={createSemiCirclePath(outerRadius, outerInnerRadius)} fill={'#F4F6FA'} />

          {/* 外层黄色填充 */}
          {thresholdAngle < 179 && (
            <path
              d={createArcPath(thresholdAngle + 1, 179, outerRadius - 6, outerRadius - 18)}
              fill={'#FDB022'}
            />
          )}

          {/* 外层蓝色填充 */}
          {thresholdAngle > 1 && (
            <path
              d={createArcPath(1, thresholdAngle - 1, outerRadius - 6, outerRadius - 18)}
              fill={'#3370FF'}
            />
          )}

          {/* 内层圆环背景 */}
          <path d={createSemiCirclePath(innerOuterRadius, innerInnerRadius)} fill={'#E1E4EB'} />

          {/* 指针 */}
          <path d={createTrianglePointerPath(actualScoreAngle)} fill={'#E1E4EB'} />
        </svg>

        {/* 分数显示 */}
        <Box
          position={'absolute'}
          top={`${centerY - 18}px`}
          left={'50%'}
          transform={'translateX(-50%)'}
          fontSize={'16px'}
          fontWeight={'600'}
          color={scoreColor}
        >
          {actualScore}
        </Box>
      </Box>
    </Flex>
  );
};

export default ScoreDashboard;
