import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Tooltip, type TooltipProps } from '@chakra-ui/react';

/** 合并 ref 回调，避免在 cloneElement 的 ref 中直接修改 children 上的 ref 对象。 */
function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') {
    ref(value);
  } else if (ref && typeof ref === 'object') {
    (ref as React.MutableRefObject<T | null>).current = value;
  }
}

interface Props extends TooltipProps {
  /**
   * 仅当触发元素横向内容溢出时展示 Tooltip，用于替代外部按字数估算的判断。
   */
  showOnlyWhenOverflow?: boolean;
}

const MyTooltip = ({
  children,
  shouldWrapChildren = true,
  showOnlyWhenOverflow = false,
  isDisabled,
  ...props
}: Props) => {
  const triggerRef = useRef<HTMLElement | null>(null);
  const [isOverflow, setIsOverflow] = useState(false);

  const checkOverflow = useCallback(() => {
    const target = triggerRef.current;

    if (!target) {
      setIsOverflow(false);
      return;
    }

    setIsOverflow(target.scrollWidth > target.clientWidth);
  }, []);

  useEffect(() => {
    if (!showOnlyWhenOverflow) return;

    checkOverflow();

    const target = triggerRef.current;
    if (!target) return;

    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(checkOverflow);
    observer?.observe(target);

    window.addEventListener('resize', checkOverflow);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', checkOverflow);
    };
  }, [checkOverflow, children, showOnlyWhenOverflow]);

  const setTriggerRef = useCallback(
    (node: HTMLElement | null) => {
      triggerRef.current = node;
      checkOverflow();
    },
    [checkOverflow]
  );

  const triggerChildren = React.isValidElement(children) ? children : null;
  const childOriginRef = triggerChildren
    ? ((triggerChildren as any).ref as React.Ref<HTMLElement> | undefined)
    : undefined;
  const triggerChildrenProps = triggerChildren?.props as
    | {
        onMouseEnter?: React.MouseEventHandler;
        onFocus?: React.FocusEventHandler;
      }
    | undefined;

  const tooltipChildren = !showOnlyWhenOverflow ? (
    children
  ) : triggerChildren ? (
    React.cloneElement(triggerChildren as React.ReactElement<any>, {
      ref: (node: HTMLElement | null) => {
        assignRef(childOriginRef, node);
        setTriggerRef(node);
      },
      onMouseEnter: (event: React.MouseEvent) => {
        checkOverflow();
        triggerChildrenProps?.onMouseEnter?.(event);
      },
      onFocus: (event: React.FocusEvent) => {
        checkOverflow();
        triggerChildrenProps?.onFocus?.(event);
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
  );

  return (
    <Tooltip
      className="chakra-tooltip"
      bg={'white'}
      arrowShadowColor={'rgba(0,0,0,0.05)'}
      hasArrow
      arrowSize={12}
      offset={[-15, 15]}
      color={'myGray.800'}
      px={4}
      py={2}
      borderRadius={'8px'}
      whiteSpace={'pre-wrap'}
      boxShadow={'1px 1px 10px rgba(0,0,0,0.2)'}
      shouldWrapChildren={showOnlyWhenOverflow ? false : shouldWrapChildren}
      isDisabled={isDisabled || (showOnlyWhenOverflow && !isOverflow)}
      {...props}
    >
      {tooltipChildren}
    </Tooltip>
  );
};

export default MyTooltip;
