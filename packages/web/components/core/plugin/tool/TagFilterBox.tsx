import { Box, Flex, Menu, MenuButton, MenuItem, MenuList, Portal } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import type { SystemPluginToolTagType } from '@fastgpt/global/core/plugin/type';
import React, { useMemo } from 'react';
import MyIcon from '../../../common/Icon';

export type MarketplaceSourceFilterValue = 'official' | 'community';

const ToolTagFilterBox = ({
  tags,
  selectedTagIds,
  onTagSelect,
  selectedSource,
  onSourceSelect,
  size = 'base',
  variant = 'default'
}: {
  tags: SystemPluginToolTagType[];
  selectedTagIds: string[];
  onTagSelect: (tagIds: string[]) => void;
  selectedSource?: MarketplaceSourceFilterValue;
  onSourceSelect?: (source?: MarketplaceSourceFilterValue) => void;
  size?: 'base' | 'sm';
  variant?: 'default' | 'marketplace';
}) => {
  const { t, i18n } = useTranslation();
  const isMarketplaceVariant = variant === 'marketplace';
  const usePillStyles = size === 'base';
  const sourceOptions = [
    { label: t('common:All'), value: undefined },
    { label: t('app:toolkit_official'), value: 'official' },
    { label: t('app:toolkit_community'), value: 'community' }
  ] as const;
  const selectedSourceLabel =
    sourceOptions.find((option) => option.value === selectedSource)?.label || t('common:All');

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
        px: '13px',
        h: '32px',
        fontSize: '14px',
        lineHeight: '21px'
      },
      sm: {
        px: 2,
        py: 1,
        h: '32px',
        fontSize: 'xs'
      }
    };

    return {
      ...sizeStyles[size],
      fontWeight: 'medium',
      color: usePillStyles ? '#383F50' : 'myGray.700',
      ...(size === 'sm'
        ? {}
        : {
            border: '1px solid',
            borderColor: '#E8EBF0'
          }),
      whiteSpace: 'nowrap',
      flexShrink: 0,
      cursor: 'pointer',
      ...(usePillStyles
        ? {
            alignItems: 'center',
            justifyContent: 'center'
          }
        : {})
    };
  }, [size, usePillStyles]);

  const getTagStateStyles = (isSelected: boolean) => ({
    display: usePillStyles ? 'inline-flex' : undefined,
    bg: usePillStyles ? 'white' : isSelected ? 'myGray.150' : 'transparent',
    borderColor: usePillStyles ? (isSelected ? '#94B5FF' : '#E8EBF0') : 'myGray.200',
    color: usePillStyles ? (isSelected ? 'primary.600' : '#383F50') : 'myGray.700',
    _hover: { bg: usePillStyles ? 'myGray.50' : 'myGray.100' }
  });

  return (
    <Flex
      alignItems={'center'}
      userSelect={'none'}
      overflow={'auto'}
      pb={usePillStyles ? 0 : 1}
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
      {isMarketplaceVariant ? (
        <>
          <Box
            mr={2}
            color={'#485264'}
            fontSize={'14px'}
            fontWeight={'medium'}
            letterSpacing={'0.1px'}
            flexShrink={0}
          >
            {t('app:logs_source')}:
          </Box>
          <Menu placement="bottom-start" autoSelect={false} isLazy>
            <MenuButton
              as={Box}
              {...tagBaseStyles}
              display={'inline-flex'}
              w={'70px'}
              px={'12px'}
              rounded={'6px'}
              bg={'white'}
              _hover={{ bg: 'myGray.50' }}
              _expanded={{ bg: 'myGray.50' }}
              _focus={{ outline: 'none', boxShadow: 'none' }}
            >
              <Flex alignItems={'center'} justifyContent={'space-between'}>
                {selectedSourceLabel}
                <MyIcon name={'core/chat/chevronDown'} w={'14px'} h={'14px'} color={'#667085'} />
              </Flex>
            </MenuButton>
            <Portal>
              <MenuList
                minW={'92px'}
                p={'6px'}
                border={'1px solid'}
                borderColor={'#E8EBF0'}
                boxShadow={'3'}
                zIndex={2000}
              >
                {sourceOptions.map((option) => {
                  const isSelected = option.value === selectedSource;

                  return (
                    <MenuItem
                      key={option.value ?? 'all'}
                      h={'32px'}
                      borderRadius={'6px'}
                      fontSize={'14px'}
                      fontWeight={'medium'}
                      color={isSelected ? 'primary.600' : '#383F50'}
                      bg={isSelected ? 'myGray.50' : 'white'}
                      _hover={{ bg: 'myGray.50' }}
                      onClick={() => onSourceSelect?.(option.value)}
                    >
                      <Box flex={1}>{option.label}</Box>
                      {isSelected && <MyIcon name={'common/check'} w={4} color={'primary.600'} />}
                    </MenuItem>
                  );
                })}
              </MenuList>
            </Portal>
          </Menu>
          <Box mx={2} h={'20px'} w={'1px'} bg={'#E8EBF0'} flexShrink={0} />
        </>
      ) : null}
      <Box
        mr={2}
        color={usePillStyles ? '#485264' : 'myGray.700'}
        fontSize={usePillStyles ? '14px' : 'sm'}
        fontWeight={'medium'}
        letterSpacing={usePillStyles ? '0.1px' : undefined}
        whiteSpace={'nowrap'}
        flexShrink={0}
      >
        {t('common:classification')}:
      </Box>
      <Box
        {...tagBaseStyles}
        {...getTagStateStyles(selectedTagIds.length === 0)}
        rounded={usePillStyles ? 'full' : 'sm'}
        onClick={() => onTagSelect([])}
      >
        {t('common:All')}
      </Box>
      {!usePillStyles && <Box mx={2} h={'20px'} w={'1px'} bg={'myGray.200'} flexShrink={0} />}
      <Box flex={1} ml={usePillStyles ? 2 : undefined}>
        <Flex gap={2} flexWrap="nowrap">
          {tags.map((tag) => {
            const isSelected = selectedTagIds.includes(tag.tagId);
            return (
              <Box
                key={tag.tagId}
                {...tagBaseStyles}
                {...getTagStateStyles(isSelected)}
                rounded={'full'}
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
