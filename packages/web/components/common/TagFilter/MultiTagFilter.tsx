import { Box, Button, Checkbox, Flex, Input, type PlacementWithLogical } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import MyPopover from '../MyPopover';
import MyIcon from '../Icon';
import MyBox from '../MyBox';
import FilterButton from './FilterButton';

export type TagFilterItem = {
  id: string;
  label: ReactNode;
};

export type TagFilterLabels = {
  title: ReactNode;
  all: ReactNode;
  searchPlaceholder: string;
  cancel: ReactNode;
};

export type TagFilterProps = {
  tags: TagFilterItem[];
  selectedTagIds: string[];
  onSelectedTagIdsChange: (tagIds: string[]) => void;
  searchValue: string;
  onSearchValueChange: (value: string) => void;
  isLoading?: boolean;
  labels: TagFilterLabels;
  placement?: PlacementWithLogical;
  offset?: [number, number];
};

const MultiTagFilter = ({
  tags,
  selectedTagIds,
  onSelectedTagIdsChange,
  searchValue,
  onSearchValueChange,
  isLoading = false,
  labels,
  placement = 'bottom-start',
  offset = [0, 4]
}: TagFilterProps) => {
  const tagMap = new Map(tags.map((tag) => [tag.id, tag]));
  const uniqueTags = Array.from(tagMap.values());

  const toggleTag = (tagId: string) => {
    const nextTagIds = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter((id) => id !== tagId)
      : [...selectedTagIds, tagId];

    onSelectedTagIdsChange(nextTagIds);
  };

  return (
    <MyPopover
      placement={placement}
      hasArrow={false}
      offset={offset}
      w={'200px'}
      closeOnBlur={true}
      trigger={'click'}
      Trigger={
        <FilterButton
          title={labels.title}
          value={selectedTagIds.length > 0 ? `(${selectedTagIds.length})` : labels.all}
        />
      }
    >
      {({ onClose }) => (
        <MyBox isLoading={isLoading} onClick={(e) => e.stopPropagation()}>
          <Box px={1.5} pt={1.5}>
            <Input
              pl={2}
              h={8}
              borderRadius={'xs'}
              value={searchValue}
              placeholder={labels.searchPlaceholder}
              onChange={(e) => onSearchValueChange(e.target.value)}
            />
          </Box>

          <Box my={1} px={1.5} maxH={'240px'} overflow={'auto'}>
            {uniqueTags.map((tag) => {
              const checked = selectedTagIds.includes(tag.id);

              return (
                <Flex
                  alignItems={'center'}
                  fontSize={'sm'}
                  px={1}
                  py={1}
                  my={1}
                  cursor={'pointer'}
                  color={checked ? 'primary.700' : 'myGray.600'}
                  _hover={{
                    bg: 'myGray.05',
                    color: 'primary.700',
                    ...(checked ? {} : { svg: { color: '#F3F3F4' } })
                  }}
                  borderRadius={'xs'}
                  key={tag.id}
                  onClick={(e) => {
                    e.preventDefault();
                    toggleTag(tag.id);
                  }}
                >
                  <Checkbox
                    isChecked={checked}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleTag(tag.id)}
                    size={'md'}
                    icon={<MyIcon name={'common/check'} w={'12px'} />}
                  />
                  <Box ml={2}>{tag.label}</Box>
                </Flex>
              );
            })}
          </Box>
          <Flex borderTop={'1px solid'} borderColor={'myGray.200'} color={'myGray.600'}>
            <Button
              w={'full'}
              fontSize={'sm'}
              _hover={{ bg: 'myGray.05', color: 'primary.700' }}
              borderRadius={'none'}
              borderBottomLeftRadius={'md'}
              borderBottomRightRadius={'md'}
              variant={'unstyled'}
              onClick={() => {
                onSearchValueChange('');
                onSelectedTagIdsChange([]);
                onClose();
              }}
            >
              {labels.cancel}
            </Button>
          </Flex>
        </MyBox>
      )}
    </MyPopover>
  );
};

export default MultiTagFilter;
