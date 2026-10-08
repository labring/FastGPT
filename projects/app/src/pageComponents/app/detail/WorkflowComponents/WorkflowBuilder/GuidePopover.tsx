import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Flex, IconButton, PopoverBody, Text } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyPopover from '@fastgpt/web/components/common/MyPopover';

const popoverWidth = 297.294;
const popoverMinHeight = 120;
const popoverBodyLeft = 9.294;
const popoverRadius = 10;
const popoverStrokeWidth = 2;
const arrowHalfHeight = 6.653;

/** 根据实际内容高度生成连续的圆角气泡轮廓，避免箭头和主体拼接产生断线。 */
const getPopoverOuterPath = (height: number) => {
  const bottom = height - 10;
  const arrowCenter = height / 2;
  const arrowTop = arrowCenter - arrowHalfHeight;
  const arrowBottom = arrowCenter + arrowHalfHeight;

  return `path("M287.294 0C292.817 0 297.294 4.477 297.294 10V${bottom}C297.294 ${
    height - 4.477
  } 292.817 ${height} 287.294 ${height}H19.294C13.771 ${height} 9.294 ${
    height - 4.477
  } 9.294 ${bottom}V${arrowBottom}L0 ${arrowCenter}L9.294 ${arrowTop}V10C9.294 4.477 13.771 0 19.294 0H287.294Z")`;
};

/**
 * 生成真实内缩的白色内轮廓。
 *
 * 箭头斜边需要沿法线方向内缩，不能通过整体缩放模拟，否则尖端、斜边和主体竖线
 * 到外轮廓的距离会不一致，在高分屏上会表现为箭头描边忽粗忽细。
 */
const getPopoverInnerPath = (height: number) => {
  const top = popoverStrokeWidth;
  const bottom = height - popoverStrokeWidth;
  const left = popoverBodyLeft + popoverStrokeWidth;
  const right = popoverWidth - popoverStrokeWidth;
  const radius = popoverRadius - popoverStrokeWidth;
  const curveOffset = radius * 0.4477;
  const arrowCenter = height / 2;
  const arrowDepth = popoverBodyLeft;
  const arrowSlope = arrowHalfHeight / arrowDepth;
  const arrowEdgeLength = Math.hypot(arrowDepth, arrowHalfHeight);
  const normalX = (arrowHalfHeight / arrowEdgeLength) * popoverStrokeWidth;
  const normalY = (arrowDepth / arrowEdgeLength) * popoverStrokeWidth;
  const arrowTipX = normalX + normalY / arrowSlope;
  const innerArrowHalfHeight = arrowSlope * (left - normalX) - normalY;
  const arrowTop = arrowCenter - innerArrowHalfHeight;
  const arrowBottom = arrowCenter + innerArrowHalfHeight;

  return `path("M${right - radius} ${top}C${right - curveOffset} ${top} ${right} ${
    top + curveOffset
  } ${right} ${top + radius}V${bottom - radius}C${right} ${
    bottom - curveOffset
  } ${right - curveOffset} ${bottom} ${right - radius} ${bottom}H${
    left + radius
  }C${left + curveOffset} ${bottom} ${left} ${bottom - curveOffset} ${left} ${
    bottom - radius
  }V${arrowBottom}L${arrowTipX} ${arrowCenter}L${left} ${arrowTop}V${
    top + radius
  }C${left} ${top + curveOffset} ${left + curveOffset} ${top} ${
    left + radius
  } ${top}H${right - radius}Z")`;
};

/** 首次进入工作流编辑器时使用的受控、不可被误关闭的顺序引导气泡。 */
const WorkflowBuilderGuidePopover = ({
  isOpen,
  title,
  description,
  titleIcon,
  onConfirm,
  children
}: {
  isOpen: boolean;
  title: string;
  description: string;
  titleIcon?: React.ReactNode;
  onConfirm: () => void;
  children: React.ReactElement;
}) => {
  const { t } = useTranslation('workflow');
  const contentRef = useRef<HTMLDivElement>(null);
  const [popoverHeight, setPopoverHeight] = useState(popoverMinHeight);
  const popoverOuterPath = useMemo(() => getPopoverOuterPath(popoverHeight), [popoverHeight]);
  const popoverInnerPath = useMemo(() => getPopoverInnerPath(popoverHeight), [popoverHeight]);

  useEffect(() => {
    if (!isOpen) return;

    const frame = requestAnimationFrame(() => {
      const contentHeight = contentRef.current?.scrollHeight;
      if (!contentHeight) return;

      // 120px 是中文稿的标准高度；多语言换行时只向下扩展，不压缩字号和间距。
      setPopoverHeight(Math.max(popoverMinHeight, Math.ceil(contentHeight + 32)));
    });

    return () => cancelAnimationFrame(frame);
  }, [description, isOpen, title]);

  return (
    <MyPopover
      Trigger={children}
      isOpen={isOpen}
      placement="right"
      offset={[0, 8]}
      hasArrow={false}
      closeOnBlur={false}
      flip={false}
      w={`${popoverWidth}px`}
      maxW={`${popoverWidth}px`}
      h={`${popoverHeight}px`}
      minH={0}
      p={0}
      border={0}
      borderRadius={0}
      background="transparent"
      boxShadow="none"
      overflow="visible"
      _focusVisible={{}}
    >
      {() => (
        <>
          <Box
            aria-hidden
            position="absolute"
            inset={0}
            bg="linear-gradient(165deg, #67B6FF 0%, #5891FF 100%)"
            clipPath={popoverOuterPath}
            filter="drop-shadow(0 0 1px rgba(19, 51, 107, 0.20)) drop-shadow(0 24px 36px rgba(19, 51, 107, 0.20))"
          />
          <Box
            aria-hidden
            position="absolute"
            zIndex={1}
            inset={0}
            bg="white"
            clipPath={popoverInnerPath}
          />
          <PopoverBody
            position="absolute"
            zIndex={1}
            top="2px"
            left="11.294px"
            w="284px"
            h={`${popoverHeight - 4}px`}
            p="14px"
            bg="transparent"
          >
            <Box ref={contentRef}>
              <Flex h="24px" alignItems="center">
                {titleIcon && (
                  <Box mr={1.5} flexShrink={0}>
                    {titleIcon}
                  </Box>
                )}
                <Text
                  flex={1}
                  color="#111824"
                  fontSize="16px"
                  fontWeight={500}
                  lineHeight="24px"
                  letterSpacing="0.15px"
                >
                  {title}
                </Text>
                <IconButton
                  aria-label={t('workflow_builder_collapse')}
                  icon={<MyIcon name="common/closeLight" boxSize="20px" />}
                  variant="unstyled"
                  minW="20px"
                  w="20px"
                  h="20px"
                  p={0}
                  color="#8A95A7"
                  onClick={onConfirm}
                />
              </Flex>
              <Text
                mt="6px"
                color="#485264"
                fontSize="14px"
                lineHeight="20px"
                letterSpacing="0.25px"
              >
                {description}
              </Text>
              <Flex mt="14px" justifyContent="flex-end">
                <Button
                  h="24px"
                  minW="53px"
                  px={2}
                  py={1}
                  borderRadius="4px"
                  bg="#3370FF"
                  color="white"
                  fontSize="11px"
                  fontWeight={500}
                  lineHeight="16px"
                  letterSpacing="0.5px"
                  _hover={{ bg: '#2B5FD9' }}
                  onClick={onConfirm}
                >
                  {t('workflow_builder_guide_got_it')}
                </Button>
              </Flex>
            </Box>
          </PopoverBody>
        </>
      )}
    </MyPopover>
  );
};

export default React.memo(WorkflowBuilderGuidePopover);
