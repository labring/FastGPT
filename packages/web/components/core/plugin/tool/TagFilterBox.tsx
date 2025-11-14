import { Box, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import type { SystemPluginToolTagType } from '@fastgpt/global/core/plugin/type';
import React, { useMemo } from 'react';

const ToolTagFilterBox = ({
  tags,
  selectedTagIds,
  onTagSelect,
  size = 'base'
}: {
  tags: SystemPluginToolTagType[];
  selectedTagIds: string[];
  onTagSelect: (tagIds: string[]) => void;
  size?: 'base' | 'sm';
}) => {
  const { t, i18n } = useTranslation();

  const toggleTag = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      onTagSelect(selectedTagIds.filter((id) => id !== tagId));
    } else {
      onTagSelect([...selectedTagIds, tagId]);
    }
  };

  const tagBaseStyles = useMemo(() => {
    const sizeStyles = {
      base: {
        px: 3,
        py: 1.5,
        fontSize: 'sm'
      },
      sm: {
        px: 2,
        py: 1,
        fontSize: 'xs'
      }
    };

    return {
      ...sizeStyles[size],
      fontWeight: 'medium',
      color: 'myGray.700',
      border: '1px solid',
      borderColor: 'myGray.200',
      whiteSpace: 'nowrap',
      flexShrink: 0,
      cursor: 'pointer'
    };
  }, [size]);

  return (
    <Flex
      alignItems={'center'}
      userSelect={'none'}
      overflow={'auto'}
      pb={1}
      css={{
        '&:hover': {
          overflow: 'auto',
          '&::-webkit-scrollbar-thumb': {
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '3px',
            visibility: 'visible'
          }
        },
        '&::-webkit-scrollbar': {
          marginTop: '2px',
          height: '6px'
        },
        '&::-webkit-scrollbar-track': {
          background: 'transparent'
        },
        '&::-webkit-scrollbar-thumb': {
          background: 'rgba(0, 0, 0, 0)',
          borderRadius: '3px',
          visibility: 'hidden'
        },
        '&::-webkit-scrollbar-thumb:hover': {
          background: 'rgba(0, 0, 0, 0.3)'
        }
      }}
    >
      <Box
        {...tagBaseStyles}
        rounded={'sm'}
        bg={selectedTagIds.length === 0 ? 'myGray.150' : 'transparent'}
        onClick={() => onTagSelect([])}
      >
        {t('common:All')}
      </Box>
      <Box mx={2} h={'20px'} w={'1px'} bg={'myGray.200'} flexShrink={0} />
      <Box flex={1}>
        <Flex gap={2} flexWrap="nowrap">
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
      </Box>
    </Flex>
  );
};

export default React.memo(ToolTagFilterBox);
