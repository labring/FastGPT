import React, { type ComponentProps } from 'react';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';

type WorkflowToolbarTooltipProps = ComponentProps<typeof MyTooltip>;

/**
 * 工作流画布左侧工具栏专用 Tooltip。
 *
 * 这里独立覆盖 Figma 规格，避免修改通用 MyTooltip 后影响其他聊天与页面。
 */
const WorkflowToolbarTooltip = ({ children, ...props }: WorkflowToolbarTooltipProps) => (
  <MyTooltip
    shouldWrapChildren={false}
    placement="right"
    offset={[0, 12]}
    hasArrow={false}
    position="relative"
    bg="white"
    color="#24282C"
    px="12px"
    py="8px"
    borderRadius="6px"
    fontSize="12px"
    fontWeight={400}
    lineHeight="18px"
    letterSpacing={0}
    boxShadow="none"
    filter="drop-shadow(0 0 1px rgba(19, 51, 107, 0.10)) drop-shadow(0 4px 10px rgba(19, 51, 107, 0.10))"
    _before={{
      content: '""',
      position: 'absolute',
      left: '-5px',
      top: '50%',
      w: '10px',
      h: '10px',
      bg: 'white',
      transform: 'translateY(-50%) rotate(45deg)'
    }}
    {...props}
  >
    {children}
  </MyTooltip>
);

export default WorkflowToolbarTooltip;
