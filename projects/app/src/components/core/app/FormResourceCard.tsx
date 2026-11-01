import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Flex, type FlexProps } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';

export type FormResourceCardProps = {
  avatar: React.ReactNode;
  name?: string;
  nameFontWeight?: string;
  isUnavailable?: boolean;
  tooltipLabel?: string;
  showTooltipOnlyWhenOverflow?: boolean;
  errorText?: string;
  actions?: React.ReactNode;
  flexProps?: FlexProps;
};

export const formResourceCardShadow =
  '0 4px 8px -2px rgba(16,24,40,.1),0 2px 4px -2px rgba(16,24,40,.06)';

export const formResourceCardBaseProps: FlexProps = {
  w: '100%',
  minW: 0,
  maxW: '100%',
  p: 2,
  bg: 'white',
  boxShadow: formResourceCardShadow,
  borderRadius: 'md',
  border: 'base'
};

/**
 * 表单资源卡片通用容器（知识库、技能等），统一错误状态高亮、文本截断、Hover 状态以及操作按钮槽位。
 */
export const FormResourceCard = React.memo(function FormResourceCard({
  avatar,
  name,
  nameFontWeight,
  isUnavailable = false,
  tooltipLabel,
  showTooltipOnlyWhenOverflow,
  errorText,
  actions,
  flexProps
}: FormResourceCardProps) {
  const hasActions = !!actions;
  const nameRef = useRef<HTMLDivElement | null>(null);
  const [isNameOverflow, setIsNameOverflow] = useState(false);
  const shouldShowOnlyWhenOverflow = showTooltipOnlyWhenOverflow ?? !isUnavailable;
  const resolvedTooltipLabel = tooltipLabel || name;

  // 仅测量名称节点自身的横向截断，避免卡片固定高度或内边距触发外层 Flex 的纵向溢出误判。
  const checkNameOverflow = useCallback(() => {
    if (!shouldShowOnlyWhenOverflow) {
      setIsNameOverflow(false);
      return;
    }

    const target = nameRef.current;
    if (!target) {
      setIsNameOverflow(false);
      return;
    }

    setIsNameOverflow(target.scrollWidth > target.clientWidth);
  }, [shouldShowOnlyWhenOverflow]);

  useEffect(() => {
    if (!shouldShowOnlyWhenOverflow) {
      setIsNameOverflow(false);
      return;
    }

    const frame = window.requestAnimationFrame(checkNameOverflow);
    const target = nameRef.current;
    if (!target) {
      return () => window.cancelAnimationFrame(frame);
    }

    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(checkNameOverflow);
    observer?.observe(target);
    window.addEventListener('resize', checkNameOverflow);

    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', checkNameOverflow);
    };
  }, [checkNameOverflow, name, shouldShowOnlyWhenOverflow]);

  return (
    <MyTooltip
      label={resolvedTooltipLabel}
      offset={[0, 8]}
      shouldWrapChildren={false}
      isDisabled={!resolvedTooltipLabel || (shouldShowOnlyWhenOverflow && !isNameOverflow)}
    >
      <Flex
        overflow={'hidden'}
        alignItems={'center'}
        userSelect={'none'}
        {...formResourceCardBaseProps}
        {...flexProps}
        onMouseEnter={(e) => {
          checkNameOverflow();
          flexProps?.onMouseEnter?.(e);
        }}
        onFocus={(e) => {
          checkNameOverflow();
          flexProps?.onFocus?.(e);
        }}
        border={flexProps?.border || formResourceCardBaseProps.border}
        borderColor={isUnavailable ? 'red.600' : flexProps?.borderColor}
        _hover={{
          ...flexProps?._hover,
          borderColor: isUnavailable ? 'red.600' : 'primary.300',
          '& .form-resource-card-controller': {
            display: 'flex'
          },
          '& .unHoverStyle': {
            display: hasActions ? 'none' : undefined
          }
        }}
      >
        {avatar}
        <Box
          ref={nameRef}
          ml={2}
          flex={'1 1 auto'}
          w={0}
          minW={0}
          className={'textEllipsis'}
          fontSize={'sm'}
          fontWeight={nameFontWeight}
          color={isUnavailable ? 'red.600' : 'myGray.900'}
        >
          {name || 'Invalid'}
        </Box>

        {errorText && (
          <MyTag colorSchema="red" type="fill" className="unHoverStyle" flexShrink={0}>
            <MyIcon name="common/error" w="14px" mr={1} />
            <MyTooltip label={errorText} showOnlyWhenOverflow offset={[0, 8]}>
              <Box color="red.600" maxW="150px" className="textEllipsis">
                {errorText}
              </Box>
            </MyTooltip>
          </MyTag>
        )}

        {hasActions && (
          <Box
            className="form-resource-card-controller"
            ml={1}
            flexShrink={0}
            display={['flex', 'none']}
            alignItems={'center'}
          >
            {actions}
          </Box>
        )}
      </Flex>
    </MyTooltip>
  );
});

export default FormResourceCard;
