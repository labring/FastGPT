import { Box, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import type { PluginTagType } from '@fastgpt/global/core/app/plugin/type';

type PluginTagFilterProps = {
  tags: PluginTagType[];
  selectedTagIds: string[];
  onTagSelect: (tagIds: string[]) => void;
  isPopover?: boolean;
  showWrapper?: boolean;
};

const PluginTagFilter = ({
  tags,
  selectedTagIds,
  onTagSelect,
  isPopover = false,
  showWrapper = true
}: PluginTagFilterProps) => {
  const { t, i18n } = useTranslation();

  const toggleTag = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      onTagSelect(selectedTagIds.filter((id) => id !== tagId));
    } else {
      onTagSelect([...selectedTagIds, tagId]);
    }
  };

  const content = (
    <>
      <Box
        px={isPopover ? 2 : 3}
        py={isPopover ? 1 : 1.5}
        fontSize={'12px'}
        fontWeight={'medium'}
        color={'myGray.700'}
        rounded={'sm'}
        border={'1px solid'}
        borderColor={'myGray.200'}
        whiteSpace={'nowrap'}
        flexShrink={0}
        cursor={'pointer'}
        bg={selectedTagIds.length === 0 ? 'myGray.100' : 'transparent'}
        onClick={() => onTagSelect([])}
        _hover={{
          bg: 'myGray.50'
        }}
      >
        {t('common:All')}
      </Box>
      <Box mx={2} h={isPopover ? '20px' : '16px'} w={'1px'} bg={'myGray.200'} />
      <Flex
        gap={2}
        flex={1}
        overflowX="auto"
        overflowY="hidden"
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
              px={isPopover ? 2 : 3}
              py={isPopover ? 1 : 1.5}
              fontSize={'12px'}
              fontWeight={'medium'}
              color={'myGray.700'}
              rounded={'full'}
              border={'1px solid'}
              borderColor={'myGray.200'}
              whiteSpace={'nowrap'}
              flexShrink={0}
              cursor={'pointer'}
              bg={isSelected ? 'myGray.100' : 'transparent'}
              onClick={() => toggleTag(tag.tagId)}
              _hover={{
                bg: 'myGray.50'
              }}
            >
              {t(parseI18nString(tag.tagName, i18n.language))}
            </Box>
          );
        })}
      </Flex>
    </>
  );

  if (showWrapper) {
    return (
      <Flex mb={4} alignItems={'center'} px={3}>
        {content}
      </Flex>
    );
  }

  return content;
};

export default PluginTagFilter;
