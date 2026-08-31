import { Flex } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { type DatasetCollectionItemType } from '@fastgpt/global/core/dataset/type';
import { type DatasetCollectionsListItemType } from '@fastgpt/global/openapi/core/dataset/collection/api';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { formatCollectionTagChipText } from './TagCommon';

const CHIP_GAP_PX = 8;

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

const TagChip = ({ text }: { text: string }) => (
  <MyTag {...TAG_CHIP_PROPS} data-tag-chip>
    {text}
  </MyTag>
);

const TagsPopOver = ({
  currentCollection
}: {
  currentCollection: DatasetCollectionItemType | DatasetCollectionsListItemType;
}) => {
  const allDatasetTags = useContextSelector(DatasetPageContext, (v) => v.allDatasetTags);
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);

  const chipItems = useMemo(
    () =>
      (currentCollection.tags ?? [])
        .map((item, index) => ({
          id: typeof item === 'string' ? item : `${item.tag}-${index}`,
          text: formatCollectionTagChipText(item, allDatasetTags)
        }))
        .filter((item) => item.text),
    [allDatasetTags, currentCollection.tags]
  );

  const [visibleCount, setVisibleCount] = useState(chipItems.length);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const calculateTags = () => {
      const chipEls = Array.from(measure.querySelectorAll('[data-tag-chip]')) as HTMLElement[];
      const overflowEl = measure.querySelector('[data-overflow-chip]') as HTMLElement | null;
      const overflowWidth = overflowEl?.offsetWidth ?? 0;
      const containerWidth = container.offsetWidth;
      let usedWidth = 0;
      let nextVisibleCount = chipEls.length;

      for (let i = 0; i < chipEls.length; i++) {
        const chipWidth = chipEls[i].offsetWidth;
        const isLast = i === chipEls.length - 1;
        const gap = isLast ? 0 : CHIP_GAP_PX;
        const reserved = isLast ? 0 : overflowWidth;

        if (usedWidth + chipWidth + gap + reserved <= containerWidth) {
          usedWidth += chipWidth + gap;
          continue;
        }

        nextVisibleCount = i;
        break;
      }

      if (nextVisibleCount === 0 && chipEls.length > 0) {
        nextVisibleCount = 1;
      }

      setVisibleCount(nextVisibleCount);
    };

    calculateTags();
    const observer = new ResizeObserver(calculateTags);
    observer.observe(container);

    return () => observer.disconnect();
  }, [chipItems]);

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
        <MyTag {...TAG_CHIP_PROPS} data-overflow-chip>
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
        {visibleTags.map((item) => (
          <TagChip key={item.id} text={item.text} />
        ))}
        {overflowTags.length > 0 && (
          <MyPopover
            trigger={'hover'}
            placement={'bottom-start'}
            hasArrow={false}
            offset={[0, 4]}
            w={'auto'}
            maxW={'320px'}
            p={2}
            Trigger={
              <Flex cursor={'pointer'} flexShrink={0} onClick={(e) => e.stopPropagation()}>
                <MyTag {...TAG_CHIP_PROPS} _hover={{ bg: '#DBF3FF' }}>
                  {`+${overflowTags.length}`}
                </MyTag>
              </Flex>
            }
          >
            {() => (
              <Flex gap={2} flexWrap={'wrap'} onClick={(e) => e.stopPropagation()}>
                {overflowTags.map((item) => (
                  <TagChip key={item.id} text={item.text} />
                ))}
              </Flex>
            )}
          </MyPopover>
        )}
      </Flex>
    </Flex>
  );
};

export default TagsPopOver;
