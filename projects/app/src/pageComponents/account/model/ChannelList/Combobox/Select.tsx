'use client';
import { Box, Text, ListItem, List } from '@chakra-ui/react';
import { ReactNode } from 'react';
import { useSelect } from 'downshift';
import { useTranslation } from 'next-i18next';

export const CustomSelect = function <T>({
  listItems,
  handleSelectedItemChange,
  handleDropdownItemDisplay,
  handleSelectedItemDisplay,
  placeholder,
  initSelectedItem
}: {
  listItems: T[];
  handleSelectedItemChange: (selectedItem: T) => void;
  handleDropdownItemDisplay: (dropdownItem: T) => ReactNode;
  handleSelectedItemDisplay: (selectedItem: T) => ReactNode;
  placeholder?: string;
  initSelectedItem?: T;
}) {
  const { t } = useTranslation();
  const items = [placeholder, ...listItems];

  const {
    isOpen,
    selectedItem,
    getToggleButtonProps,
    getMenuProps,
    getItemProps,
    highlightedIndex
  } = useSelect({
    items: items,
    initialSelectedItem: initSelectedItem,
    onSelectedItemChange: ({ selectedItem: newSelectedItem }) => {
      if (newSelectedItem === placeholder) {
        handleSelectedItemChange(undefined as T);
      } else {
        handleSelectedItemChange(newSelectedItem as T);
      }
    }
  });

  return (
    <Box w="full" position="relative" flex={1}>
      <Box
        h="32px"
        w="full"
        borderRadius="6px"
        border="1px solid"
        borderColor="myGray.200"
        bgColor="white"
        display="flex"
        alignItems="center"
        {...getToggleButtonProps()}
        _hover={{ borderColor: 'primary.300' }}
        px="12px"
      >
        {selectedItem ? (
          handleSelectedItemDisplay(selectedItem as T)
        ) : placeholder ? (
          <Text
            flex={1}
            fontSize="12px"
            fontWeight={400}
            lineHeight="16px"
            letterSpacing="0.048px"
            color={selectedItem ? 'myGray.900' : 'myGray.500'}
          >
            {placeholder}
          </Text>
        ) : (
          <Text
            flex={1}
            fontSize="12px"
            fontWeight={400}
            lineHeight="16px"
            letterSpacing="0.048px"
            color={selectedItem ? 'myGray.900' : 'myGray.500'}
          >
            Select
          </Text>
        )}
        <Box ml="auto" transform={isOpen ? 'rotate(180deg)' : undefined}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M2.5 4.5L6 8L9.5 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Box>
      </Box>

      <List
        {...getMenuProps()}
        position="absolute"
        mt="2px"
        w="full"
        py="6px"
        pl="6px"
        pr="6px"
        bg="white"
        alignItems="flex-start"
        border="1px solid"
        borderColor="myGray.200"
        maxH="60"
        overflowY="auto"
        zIndex="10"
        borderRadius="6px"
        display={isOpen && items.length ? 'block' : 'none'}
      >
        {isOpen &&
          items.map((item, index) => (
            <ListItem
              {...getItemProps({ item, index })}
              key={index}
              display="flex"
              padding="8px 4px"
              alignItems="center"
              gap="8px"
              alignSelf="stretch"
              borderRadius="4px"
              bg={highlightedIndex === index ? 'myGray.50' : 'transparent'}
              fontWeight={selectedItem === item ? 'bold' : 'normal'}
              cursor="pointer"
              color="myGray.900"
              fontSize="12px"
              fontStyle="normal"
              lineHeight="16px"
              letterSpacing="0.5px"
              _hover={{ bg: 'myGray.50' }}
            >
              {handleDropdownItemDisplay(item as T)}
            </ListItem>
          ))}
      </List>
    </Box>
  );
};
