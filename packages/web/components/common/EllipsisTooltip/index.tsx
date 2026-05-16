/**
 * @file 悬浮提示组件
 * TODO - 待优化成全局单例
 */
import React, { useLayoutEffect, useRef, useState } from 'react';
import { Box, type BoxProps, type TooltipProps } from '@chakra-ui/react';
import MyTooltip from '../MyTooltip/index';

function isOverflow(el: HTMLElement): boolean {
  if (!el) return false;

  // 单行水平溢出（white-space: nowrap + text-overflow: ellipsis）
  if (el.scrollWidth > el.clientWidth) return true;

  // 多行 / 单行 line-clamp：临时移除截断约束，对比自然高度与截断高度
  // 直接修改原元素 inline style（优先级高于 class），避免克隆带来的继承样式丢失问题
  const clampedHeight = el.getBoundingClientRect().height;
  el.style.webkitLineClamp = 'unset';
  el.style.overflow = 'visible';
  el.style.maxHeight = 'none';
  const naturalHeight = el.getBoundingClientRect().height;
  // 置空 inline style，让 class 样式重新生效
  el.style.webkitLineClamp = '';
  el.style.overflow = '';
  el.style.maxHeight = '';

  // 1px 容差防止行高计算的浮点误差
  return naturalHeight > clampedHeight + 1;
}

type EllipsisTooltipProps = {
  label: string;
  /** 强制显示 tooltip，忽略溢出检测 */
  forceShow?: boolean;
  /** Tooltip 展示内容，不传则默认使用 label */
  tooltipLabel?: React.ReactNode;
  /** 省略行数：1=单行（默认），n>1=多行 */
  lineClamp?: number;
  /** 透传给 Tooltip 的额外属性 */
  tooltipProps?: Omit<TooltipProps, 'label' | 'isDisabled' | 'children'>;
} & Omit<BoxProps, 'children'>;

const EllipsisTooltip = ({
  label,
  tooltipLabel,
  lineClamp = 1,
  tooltipProps,
  forceShow,
  ...boxProps
}: EllipsisTooltipProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isOverflowed, setIsOverflowed] = useState(false);

  useLayoutEffect(() => {
    if (ref.current) setIsOverflowed(isOverflow(ref.current));
  }, [label, lineClamp]);

  const handleMouseEnter = () => {
    if (ref.current) setIsOverflowed(isOverflow(ref.current));
  };

  return (
    <MyTooltip
      label={tooltipLabel ?? label}
      isDisabled={!forceShow && !isOverflowed}
      hasArrow
      shouldWrapChildren={false}
      {...tooltipProps}
    >
      <Box ref={ref} onMouseEnter={handleMouseEnter} noOfLines={lineClamp} {...boxProps}>
        {label}
      </Box>
    </MyTooltip>
  );
};

export default EllipsisTooltip;
