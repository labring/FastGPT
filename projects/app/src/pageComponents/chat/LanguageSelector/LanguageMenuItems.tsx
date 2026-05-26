import React from 'react';
import { Box, Flex, MenuItem } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { langMap, type localeType } from '@fastgpt/global/common/i18n/type';
import { chatLanguageList } from './useChatLanguageSwitch';

export type LanguageMenuItemsVariant = 'menuItem' | 'list' | 'mobileList';

type Props = {
  currentLang: localeType;
  variant?: LanguageMenuItemsVariant;
  onSelect: (lng: localeType) => void | Promise<void>;
};

/**
 * 聊天语言选项列表。
 * 同一组选项在 Popover、MenuList 和 PhoneDrawer 中复用，外层容器由调用方决定。
 */
const LanguageMenuItems = ({ currentLang, variant = 'menuItem', onSelect }: Props) => {
  const isPlainList = variant !== 'menuItem';
  const isMobileList = variant === 'mobileList';

  const items = chatLanguageList.map((lng) => {
    const isSelected = currentLang === lng;
    const optionContent = (
      <Flex alignItems="center" justifyContent="space-between" w="100%">
        <Box>{langMap[lng].label}</Box>
        {isSelected && <MyIcon name="check" w="16px" />}
      </Flex>
    );

    if (isPlainList) {
      return (
        <Flex
          key={lng}
          alignItems="center"
          justifyContent="space-between"
          h={isMobileList ? '44px' : '30px'}
          px={2}
          py={1}
          borderRadius="4px"
          cursor="pointer"
          bg={isSelected ? 'rgba(17, 24, 36, 0.05)' : 'transparent'}
          color={isSelected ? 'primary.600' : 'myGray.600'}
          fontSize={isMobileList ? '16px' : '14px'}
          fontWeight={isMobileList ? 500 : undefined}
          lineHeight={isMobileList ? '24px' : '20px'}
          letterSpacing={isMobileList ? '0.15px' : undefined}
          _hover={{ bg: 'rgba(17, 24, 36, 0.05)' }}
          onClick={() => onSelect(lng)}
        >
          {optionContent}
        </Flex>
      );
    }

    return (
      <MenuItem
        key={lng}
        h="44px"
        borderRadius="6px"
        bg={isSelected ? 'rgba(17, 24, 36, 0.05)' : 'transparent'}
        color={isSelected ? 'primary.600' : 'myGray.900'}
        fontSize="14px"
        lineHeight="20px"
        _hover={{ bg: 'rgba(17, 24, 36, 0.05)' }}
        onClick={() => onSelect(lng)}
      >
        {optionContent}
      </MenuItem>
    );
  });

  if (isPlainList) {
    return (
      <Flex flexDirection="column" w="100%">
        {items}
      </Flex>
    );
  }

  return <>{items}</>;
};

export default React.memo(LanguageMenuItems);
