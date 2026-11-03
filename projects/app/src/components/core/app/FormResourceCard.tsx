import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Flex, type FlexProps } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';

export type FormResourceCardProps = {
  avatar: React.ReactNode;
  name?: string;
  nameFontWeight?: string;
  compact?: boolean;
  isUnavailable?: boolean;
  tooltipLabel?: string;
  showTooltipOnlyWhenOverflow?: boolean;
  errorText?: string;
  statusContent?: React.ReactNode;
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

export const formResourceCardCompactProps: FlexProps = {
  h: 10,
  px: 3,
  py: 2.5,
  boxShadow: 'none',
  borderRadius: '6px'
};

/**
 * 表单资源卡片通用容器（知识库、技能等），统一错误状态高亮、文本截断、Hover 状态以及操作按钮槽位。
 * 操作按钮采用绝对定位悬浮展示，避免 hover 时内部文本宽度突变引发抖动与重绘循环。
 */
export const FormResourceCard = React.memo(function FormResourceCard({
  avatar,
  name,
  nameFontWeight,
  compact = false,
  isUnavailable = false,
  tooltipLabel,
  showTooltipOnlyWhenOverflow,
  errorText,
  statusContent,
  actions,
  flexProps
}: FormResourceCardProps) {
  const hasActions = !!actions;
  const resolvedFlexProps = compact ? { ...formResourceCardCompactProps, ...flexProps } : flexProps;
  const isCompactCard = compact || resolvedFlexProps?.h === 10;
  const nameRef = useRef<HTMLDivElement | null>(null);
  const [isNameOverflow, setIsNameOverflow] = useState(false);
  const [isHoveringActions, setIsHoveringActions] = useState(false);
  const shouldShowOnlyWhenOverflow = showTooltipOnlyWhenOverflow ?? !isUnavailable;

  // 测量名称节点自身的横向截断，避免卡片固定高度或内边距触发外层 Flex 的纵向溢出误判。
  const checkNameOverflow = useCallback(() => {
    const target = nameRef.current;
    if (!target) {
      setIsNameOverflow(false);
      return;
    }

    setIsNameOverflow(target.scrollWidth > target.clientWidth);
  }, []);

  useEffect(() => {
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
  }, [checkNameOverflow, name]);

  const resolvedTooltipLabel = useMemo(() => {
    if (isUnavailable) return tooltipLabel || name || '';
    if (tooltipLabel && tooltipLabel !== name) {
      if (isNameOverflow) {
        return `${name}\n\n${tooltipLabel}`;
      }
      return tooltipLabel;
    }
    if (isNameOverflow) {
      return name || '';
    }
    return '';
  }, [isNameOverflow, isUnavailable, name, tooltipLabel]);

  return (
    <MyTooltip
      label={resolvedTooltipLabel}
      offset={[0, 8]}
      shouldWrapChildren={false}
      isDisabled={
        !resolvedTooltipLabel ||
        isHoveringActions ||
        (shouldShowOnlyWhenOverflow && !isNameOverflow && !tooltipLabel)
      }
    >
      <Flex
        position={'relative'}
        overflow={'hidden'}
        alignItems={'center'}
        userSelect={'none'}
        role={'group'}
        {...formResourceCardBaseProps}
        {...resolvedFlexProps}
        onMouseEnter={resolvedFlexProps?.onMouseEnter}
        onFocus={resolvedFlexProps?.onFocus}
        border={resolvedFlexProps?.border || formResourceCardBaseProps.border}
        borderColor={isUnavailable ? 'red.600' : resolvedFlexProps?.borderColor}
        _hover={{
          ...resolvedFlexProps?._hover,
          borderColor: isUnavailable ? 'red.600' : 'primary.300',
          '& .form-resource-card-controller': {
            display: 'flex'
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
          fontWeight={nameFontWeight ?? (compact ? 'medium' : undefined)}
          color={isUnavailable ? 'red.600' : 'myGray.900'}
        >
          {name || 'Invalid'}
        </Box>

        {(statusContent || errorText) && (
          <Flex gap={1} minW={0} flexShrink={0} ml={1.5} alignItems={'center'}>
            {statusContent}
            {errorText && (
              <MyTag colorSchema="red" type="fill" flexShrink={0}>
                <MyIcon name="common/error" w="14px" mr={1} />
                <Box
                  color="red.600"
                  maxW={isCompactCard ? '80px' : '150px'}
                  className="textEllipsis"
                >
                  {errorText}
                </Box>
              </MyTag>
            )}
          </Flex>
        )}

        {hasActions && (
          <Box
            className="form-resource-card-controller"
            position={'absolute'}
            right={1.5}
            top={'50%'}
            transform={'translateY(-50%)'}
            bg={'white'}
            pl={1}
            display={['flex', 'none']}
            alignItems={'center'}
            onMouseEnter={() => setIsHoveringActions(true)}
            onMouseLeave={() => setIsHoveringActions(false)}
          >
            {actions}
          </Box>
        )}
      </Flex>
    </MyTooltip>
  );
});

export default FormResourceCard;
