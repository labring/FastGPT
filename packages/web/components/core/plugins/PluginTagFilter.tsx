import { Box, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import type { SystemPluginToolTagType } from '@fastgpt/global/core/plugin/type';

const PluginTagFilter = ({
  tags,
  selectedTagIds,
  onTagSelect,
  isPopover = false
}: {
  tags: SystemPluginToolTagType[];
  selectedTagIds: string[];
  onTagSelect: (tagIds: string[]) => void;
  isPopover?: boolean;
}) => {
  const { t, i18n } = useTranslation();

  const toggleTag = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      onTagSelect(selectedTagIds.filter((id) => id !== tagId));
    } else {
      onTagSelect([...selectedTagIds, tagId]);
    }
  };

  const tagBaseStyles = {
    px: isPopover ? 2 : 3,
    py: isPopover ? 1 : 1.5,
    fontSize: '12px',
    fontWeight: 'medium',
    color: 'myGray.700',
    border: '1px solid',
    borderColor: 'myGray.200',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    cursor: 'pointer'
  };

  return (
    <>
      <Box
        {...tagBaseStyles}
        rounded={'sm'}
        bg={selectedTagIds.length === 0 ? 'myGray.150' : 'transparent'}
        onClick={() => onTagSelect([])}
      >
        {t('common:All')}
      </Box>
      <Box mx={2} h={'20px'} w={'1px'} bg={'myGray.200'} />
      <Flex
        gap={2}
        flex={1}
        overflowX="auto"
        flexWrap="nowrap"
        css={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          '&::-webkit-scrollbar': { display: 'none' }
        }}
      >
        {tags.map((tag) => {
          const isSelected = selectedTagIds.includes(tag.tagId);
          return (
            <Box
              key={tag.tagId}
              {...tagBaseStyles}
              rounded={'full'}
              bg={isSelected ? 'myGray.150 !important' : 'transparent'}
              onClick={() => toggleTag(tag.tagId)}
            >
              {t(parseI18nString(tag.tagName, i18n.language))}
            </Box>
          );
        })}
      </Flex>
    </>
  );
};

export default PluginTagFilter;
