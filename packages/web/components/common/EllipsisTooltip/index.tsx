/**
 * @file 悬浮提示组件
 * TODO - 待优化成全局单例
 */
import React, { useRef, useState } from 'react';
import { Box, type BoxProps, type TooltipProps } from '@chakra-ui/react';
import MyTooltip from '../MyTooltip/index';

function isOverflow(el: HTMLElement): boolean {
  if (!el) return false;
  if (el.clientWidth < el.scrollWidth) return true;

  if (el.clientWidth === el.scrollWidth) {
    const clientWidth = el.getBoundingClientRect().width;
    const range = document.createRange();
    range.selectNodeContents(el);
    const rangeWidth = range.getBoundingClientRect().width;
    const style = window.getComputedStyle(el);
    const padding =
      (parseInt(style.paddingLeft, 10) || 0) + (parseInt(style.paddingRight, 10) || 0);
    const scrollWidth = rangeWidth + padding;
    if (clientWidth < scrollWidth && Math.abs(el.scrollWidth - scrollWidth) < 1) return true;
  }

  const lineClamp = Number(window.getComputedStyle(el).getPropertyValue('-webkit-line-clamp'));
  if (lineClamp > 1 && el.clientHeight < el.scrollHeight) return true;

  return false;
}

type EllipsisTooltipProps = {
  label: string;
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
  ...boxProps
}: EllipsisTooltipProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isOverflowed, setIsOverflowed] = useState(false);

  const handleMouseEnter = () => {
    if (ref.current) setIsOverflowed(isOverflow(ref.current));
  };

  const multiLineStyle =
    lineClamp > 1
      ? {
          overflow: 'hidden' as const,
          sx: { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: lineClamp }
        }
      : {
          whiteSpace: 'nowrap' as const,
          overflow: 'hidden' as const,
          textOverflow: 'ellipsis' as const
        };

  return (
    <MyTooltip label={tooltipLabel ?? label} isDisabled={!isOverflowed} hasArrow {...tooltipProps}>
      <Box ref={ref} onMouseEnter={handleMouseEnter} {...multiLineStyle} {...boxProps}>
        {label}
      </Box>
    </MyTooltip>
  );
};

export default EllipsisTooltip;
