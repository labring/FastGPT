import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import type { OpenApiTagType } from '@fastgpt/global/openapi/support/openapi/tag';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';

export type ApiKeyDisplayTag = Pick<OpenApiTagType, '_id' | 'name'> & {
  isAppName?: boolean;
};

const TAG_GAP_PX = 8;

const TagPill = React.forwardRef<
  HTMLDivElement,
  {
    tag: ApiKeyDisplayTag;
    showFullName?: boolean;
  }
>(({ tag, showFullName = false }, ref) => (
  <Flex
    ref={ref}
    alignItems={'center'}
    h={5}
    px={2}
    fontSize={'11px'}
    fontWeight={'500'}
    lineHeight={'20px'}
    bg={tag.isAppName ? 'orange.50' : '#F0FBFF'}
    color={tag.isAppName ? 'orange.600' : '#0884DD'}
    borderRadius={'xs'}
    maxW={showFullName ? '260px' : '120px'}
    flexShrink={0}
    overflow={showFullName ? 'visible' : 'hidden'}
    userSelect={'none'}
  >
    <Box
      minW={0}
      overflow={showFullName ? 'visible' : 'hidden'}
      textOverflow={showFullName ? 'clip' : 'ellipsis'}
      whiteSpace={'nowrap'}
    >
      {tag.name}
    </Box>
  </Flex>
));

TagPill.displayName = 'TagPill';

const OverflowBadge = React.forwardRef<HTMLDivElement, { count: number }>(({ count }, ref) => (
  <Flex
    ref={ref}
    alignItems={'center'}
    h={5}
    px={2}
    bg={'#1118240D'}
    borderRadius={'33px'}
    fontSize={'11px'}
    flexShrink={0}
    userSelect={'none'}
  >
    {`+${count}`}
  </Flex>
));

OverflowBadge.displayName = 'OverflowBadge';

const ApiKeyTag = ({
  tag,
  showFullName = false
}: {
  tag: ApiKeyDisplayTag;
  showFullName?: boolean;
}) => (
  <MyTooltip label={tag.name} showOnlyWhenOverflow>
    <TagPill tag={tag} showFullName={showFullName} />
  </MyTooltip>
);

const TagDisplayList = ({ tags }: { tags: ApiKeyDisplayTag[] }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const overflowMeasureRef = React.useRef<HTMLDivElement>(null);
  const tagMeasureRefs = React.useRef<Array<HTMLDivElement | null>>([]);
  const [visibleCount, setVisibleCount] = React.useState(tags.length);

  const calculateVisibleCount = React.useCallback(() => {
    const containerWidth = containerRef.current?.clientWidth || 0;
    const overflowBadgeWidth = overflowMeasureRef.current?.offsetWidth || 0;
    const tagWidths = tags.map((_, index) => tagMeasureRefs.current[index]?.offsetWidth || 0);

    if (containerWidth <= 0 || tagWidths.some((width) => width <= 0)) {
      setVisibleCount(tags.length);
      return;
    }

    for (let count = tags.length; count >= 0; count--) {
      const overflowCount = tags.length - count;
      const visibleWidth =
        tagWidths.slice(0, count).reduce((sum, width) => sum + width, 0) +
        Math.max(count - 1, 0) * TAG_GAP_PX;
      const totalWidth =
        visibleWidth +
        (overflowCount > 0 ? overflowBadgeWidth : 0) +
        (overflowCount > 0 && count > 0 ? TAG_GAP_PX : 0);

      if (totalWidth <= containerWidth) {
        setVisibleCount((oldCount) => (oldCount === count ? oldCount : count));
        return;
      }
    }

    setVisibleCount(0);
  }, [tags]);

  React.useEffect(() => {
    const frameId = requestAnimationFrame(calculateVisibleCount);

    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') {
      return () => cancelAnimationFrame(frameId);
    }

    const resizeObserver = new ResizeObserver(calculateVisibleCount);
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
    };
  }, [calculateVisibleCount]);

  const safeVisibleCount = Math.min(visibleCount, tags.length);
  const visibleTags = tags.slice(0, safeVisibleCount);
  const overflowTags = tags.slice(safeVisibleCount);

  if (tags.length === 0) {
    return null;
  }

  return (
    <Box ref={containerRef} position={'relative'} w={'100%'} minW={0} userSelect={'none'}>
      <Flex alignItems={'center'} gap={2} maxW={'100%'} minW={0} overflow={'hidden'}>
        {visibleTags.map((tag) => (
          <ApiKeyTag key={tag._id} tag={tag} />
        ))}
        {overflowTags.length > 0 && (
          <MyPopover
            placement="bottom-end"
            hasArrow={false}
            offset={[2, 2]}
            w={'360px'}
            maxW={'calc(100vw - 32px)'}
            trigger={'hover'}
            Trigger={<OverflowBadge count={overflowTags.length} />}
          >
            {() => (
              <Flex gap={2} p={3} flexWrap={'wrap'}>
                {overflowTags.map((tag) => (
                  <ApiKeyTag key={tag._id} tag={tag} showFullName />
                ))}
              </Flex>
            )}
          </MyPopover>
        )}
      </Flex>
      <Flex
        position={'absolute'}
        visibility={'hidden'}
        pointerEvents={'none'}
        h={0}
        overflow={'hidden'}
        gap={2}
      >
        {tags.map((tag, index) => (
          <TagPill
            key={tag._id}
            tag={tag}
            ref={(element) => {
              tagMeasureRefs.current[index] = element;
            }}
          />
        ))}
        <OverflowBadge ref={overflowMeasureRef} count={tags.length} />
      </Flex>
    </Box>
  );
};

export default React.memo(TagDisplayList);
