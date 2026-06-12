import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Tooltip, type TooltipProps, useMergeRefs } from '@chakra-ui/react';

const defaultTooltipProps = {
  className: 'chakra-tooltip',
  bg: 'white',
  arrowShadowColor: 'rgba(0,0,0,0.05)',
  hasArrow: true,
  arrowSize: 12,
  offset: [-15, 15] as [number, number],
  color: 'myGray.800',
  px: 4,
  py: 2,
  borderRadius: '8px',
  whiteSpace: 'pre-wrap',
  boxShadow: '1px 1px 10px rgba(0,0,0,0.2)'
} satisfies Omit<TooltipProps, 'children'>;

interface Props extends TooltipProps {
  /**
   * 仅当触发元素横向内容溢出时展示 Tooltip，用于替代外部按字数估算的判断。
   */
  showOnlyWhenOverflow?: boolean;
}

/**
 * 为“仅溢出时展示”模式注入测量 ref，并保留原子元素上的 ref 与 hover/focus 事件。
 * 普通 Tooltip 不走这段逻辑，避免全局 tooltip 都承担 DOM 测量成本。
 */
const useOverflowTooltipTrigger = ({
  children,
  enabled
}: {
  children: React.ReactNode;
  enabled: boolean;
}) => {
  const triggerRef = useRef<HTMLElement | null>(null);
  const [isOverflow, setIsOverflow] = useState(false);

  const checkOverflow = useCallback(() => {
    if (!enabled) {
      setIsOverflow(false);
      return;
    }

    const target = triggerRef.current;

    if (!target) {
      setIsOverflow(false);
      return;
    }

    setIsOverflow(
      target.scrollWidth > target.clientWidth || target.scrollHeight > target.clientHeight
    );
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const frame = window.requestAnimationFrame(checkOverflow);

    const target = triggerRef.current;
    if (!target) {
      return () => window.cancelAnimationFrame(frame);
    }

    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(checkOverflow);
    observer?.observe(target);

    window.addEventListener('resize', checkOverflow);

    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', checkOverflow);
    };
  }, [checkOverflow, children, enabled]);

  const setTriggerRef = useCallback(
    (node: HTMLElement | null) => {
      triggerRef.current = node;
      checkOverflow();
    },
    [checkOverflow]
  );

  const triggerElement = React.isValidElement(children) ? children : null;
  const childOriginRef = triggerElement
    ? ((triggerElement as any).ref as React.Ref<HTMLElement> | undefined)
    : undefined;
  const triggerElementProps = triggerElement?.props as
    | {
        onMouseEnter?: React.MouseEventHandler;
        onFocus?: React.FocusEventHandler;
      }
    | undefined;
  const mergedRef = useMergeRefs(childOriginRef, setTriggerRef);

  if (!enabled) {
    return {
      isOverflow: false,
      triggerChildren: children
    };
  }

  return {
    isOverflow,
    triggerChildren: triggerElement ? (
      React.cloneElement(triggerElement as React.ReactElement<any>, {
        ref: mergedRef,
        onMouseEnter: (event: React.MouseEvent) => {
          checkOverflow();
          triggerElementProps?.onMouseEnter?.(event);
        },
        onFocus: (event: React.FocusEvent) => {
          checkOverflow();
          triggerElementProps?.onFocus?.(event);
        }
      })
    ) : (
      <span
        ref={setTriggerRef}
        style={{ display: 'inline-block', maxWidth: '100%' }}
        onMouseEnter={checkOverflow}
        onFocus={checkOverflow}
      >
        {children}
      </span>
    )
  };
};

const MyTooltip = ({
  children,
  shouldWrapChildren = true,
  showOnlyWhenOverflow = false,
  isDisabled,
  ...props
}: Props) => {
  const { isOverflow, triggerChildren } = useOverflowTooltipTrigger({
    children,
    enabled: showOnlyWhenOverflow
  });
  const finalChildren = showOnlyWhenOverflow ? triggerChildren : children;
  const finalShouldWrapChildren = showOnlyWhenOverflow ? false : shouldWrapChildren;
  const finalIsDisabled = isDisabled || (showOnlyWhenOverflow && !isOverflow);

  return (
    <Tooltip
      {...defaultTooltipProps}
      shouldWrapChildren={finalShouldWrapChildren}
      isDisabled={finalIsDisabled}
      {...props}
    >
      {finalChildren}
    </Tooltip>
  );
};

export default MyTooltip;
