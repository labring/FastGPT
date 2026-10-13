import { Box, Flex } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { useLayoutEffect, useMemo, useState } from 'react';
import { type DatasetCollectionItemType } from '@fastgpt/global/core/dataset/type';
import { type DatasetCollectionsListItemType } from '@fastgpt/global/openapi/core/dataset/collection/api';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import {
  formatCollectionTagChipText,
  OVERFLOW_CHIP_GAP_PX,
  parseCollectionTagParts,
  TAG_TOOLTIP_PROPS,
  TagTooltipItem,
  useOverflowChipCount
} from './TagCommon';

const TAG_CHIP_PROPS = {
  colorSchema: 'cyan' as const,
  type: 'fill' as const,
  h: '20px',
  px: 2,
  flexShrink: 0,
  fontSize: 'mini',
  fontWeight: 'medium',
  borderRadius: 'xs' as const
};

const OVERFLOW_TAG_CHIP_PROPS = {
  ...TAG_CHIP_PROPS,
  borderRadius: 'full' as const
};

/** 渲染知识库列表中的标签；单个标签成为唯一可见项时允许收缩并展示完整文本。 */
const TagChip = ({
  text,
  name,
  value,
  isFlexible = false,
  withTooltip = false
}: {
  text: string;
  name?: string;
  value?: string;
  isFlexible?: boolean;
  withTooltip?: boolean;
}) => {
  const tagText = (
    <Box
      minW={0}
      overflow={isFlexible ? 'hidden' : undefined}
      textOverflow="ellipsis"
      whiteSpace="nowrap"
    >
      {text}
    </Box>
  );

  const tagContent = withTooltip ? (
    <MyTooltip
      label={<TagTooltipItem name={name || text} value={value} />}
      shouldWrapChildren={false}
      {...TAG_TOOLTIP_PROPS}
    >
      {tagText}
    </MyTooltip>
  ) : (
    tagText
  );

  const chip = (
    <MyTag
      {...TAG_CHIP_PROPS}
      data-tag-chip
      flex={isFlexible ? '0 1 auto' : '0 0 auto'}
      minW={isFlexible ? 0 : undefined}
      maxW={isFlexible ? '100%' : undefined}
      overflow={isFlexible ? 'hidden' : undefined}
      cursor={withTooltip ? 'pointer' : undefined}
      _hover={withTooltip ? { bg: '#DBF3FF' } : undefined}
    >
      {tagContent}
    </MyTag>
  );

  return chip;
};

const TagsPopOver = ({
  currentCollection
}: {
  currentCollection: DatasetCollectionItemType | DatasetCollectionsListItemType;
}) => {
  const allDatasetTags = useContextSelector(DatasetPageContext, (v) => v.allDatasetTags);

  const chipItems = useMemo(
    () =>
      (currentCollection.tags ?? [])
        .map((item, index) => {
          const parts = parseCollectionTagParts(item, allDatasetTags);
          return {
            id: typeof item === 'string' ? item : `${item.tag}-${index}`,
            text: formatCollectionTagChipText(item, allDatasetTags),
            name: parts.name,
            value: parts.value
          };
        })
        .filter((item) => item.text),
    [allDatasetTags, currentCollection.tags]
  );

  const { containerRef, measureRef, visibleCount } = useOverflowChipCount({
    itemKey: chipItems,
    itemCount: chipItems.length
  });

  const [shouldShrinkFirstTag, setShouldShrinkFirstTag] = useState(false);
  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const calculate = () => {
      const firstTag = measure.querySelector('[data-tag-chip]') as HTMLElement | null;
      const overflowChip = container.querySelector('[data-overflow-chip]') as HTMLElement | null;
      const hasOnlyOneVisibleTag = visibleCount === 1;

      if (!firstTag || !hasOnlyOneVisibleTag) {
        setShouldShrinkFirstTag(false);
        return;
      }

      const availableWidth =
        container.offsetWidth -
        (chipItems.length > 1 ? (overflowChip?.offsetWidth ?? 0) + OVERFLOW_CHIP_GAP_PX : 0);
      setShouldShrinkFirstTag(firstTag.offsetWidth > availableWidth);
    };

    calculate();
    const observer = new ResizeObserver(calculate);
    observer.observe(container);
    return () => observer.disconnect();
  }, [chipItems.length, containerRef, measureRef, visibleCount]);

  if (chipItems.length === 0) return null;

  const visibleTags = chipItems.slice(0, visibleCount);
  const overflowTags = chipItems.slice(visibleCount);

  return (
    <Flex position={'relative'} w={'100%'} minW={0} h={'20px'}>
      <Flex
        ref={measureRef}
        position={'absolute'}
        visibility={'hidden'}
        pointerEvents={'none'}
        alignItems={'center'}
        gap={2}
        whiteSpace={'nowrap'}
        h={0}
        overflow={'hidden'}
      >
        {chipItems.map((item) => (
          <TagChip key={item.id} text={item.text} />
        ))}
        <MyTag {...OVERFLOW_TAG_CHIP_PROPS} data-overflow-chip>
          {`+${chipItems.length}`}
        </MyTag>
      </Flex>
      <Flex
        ref={containerRef}
        alignItems={'center'}
        flexWrap={'nowrap'}
        gap={2}
        w={'100%'}
        minW={0}
        h={'20px'}
        overflow={'hidden'}
      >
        {visibleTags.map((item, index) => (
          <TagChip
            key={item.id}
            text={item.text}
            name={item.name}
            value={item.value}
            isFlexible={index === 0 && shouldShrinkFirstTag}
            withTooltip={index === 0 && shouldShrinkFirstTag}
          />
        ))}
        {overflowTags.length > 0 && (
          <MyTooltip
            label={
              <Flex
                direction={'column'}
                alignItems={'flex-start'}
                maxH={'240px'}
                overflowY={'auto'}
              >
                {overflowTags.map((item) => (
                  <TagTooltipItem key={item.id} name={item.name} value={item.value} />
                ))}
              </Flex>
            }
            shouldWrapChildren={false}
            {...TAG_TOOLTIP_PROPS}
          >
            <Flex
              cursor={'pointer'}
              flexShrink={0}
              borderRadius={'full'}
              onClick={(e) => e.stopPropagation()}
            >
              <MyTag {...OVERFLOW_TAG_CHIP_PROPS} data-overflow-chip _hover={{ bg: '#DBF3FF' }}>
                {`+${overflowTags.length}`}
              </MyTag>
            </Flex>
          </MyTooltip>
        )}
      </Flex>
    </Flex>
  );
};

export default TagsPopOver;
