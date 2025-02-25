'use client';
import {
  Box,
  Button,
  Flex,
  Text,
  Input,
  FormLabel,
  VStack,
  ListItem,
  List
} from '@chakra-ui/react';
import { useState, useMemo, Dispatch, SetStateAction, ReactNode } from 'react';
import { useCombobox, useMultipleSelection } from 'downshift';
import { useTranslation } from 'next-i18next';
import { CreateModelMenu } from '@/pageComponents/account/model/ModelConfigTable';

export const MultiSelectCombobox = function <T>({
  dropdownItems,
  selectedItems,
  setSelectedItems,
  handleFilteredDropdownItems,
  handleDropdownItemDisplay,
  handleSelectedItemDisplay,
  handleSetCustomSelectedItem
}: {
  dropdownItems: T[];
  selectedItems: T[];
  setSelectedItems: Dispatch<SetStateAction<T[]>>;
  handleFilteredDropdownItems: (dropdownItems: T[], selectedItems: T[], inputValue: string) => T[];
  handleDropdownItemDisplay: (dropdownItem: T) => ReactNode;
  handleSelectedItemDisplay: (selectedItem: T) => ReactNode;
  handleSetCustomSelectedItem?: () => void;
}): JSX.Element {
  const { t } = useTranslation();

  const [inputValue, setInputValue] = useState<string>('');

  // Dropdown list excludes already selected options and includes those matching the input.
  const items = useMemo(
    () => handleFilteredDropdownItems(dropdownItems, selectedItems, inputValue),
    [inputValue, selectedItems, dropdownItems, handleFilteredDropdownItems]
  );

  const { getSelectedItemProps, getDropdownProps, removeSelectedItem } = useMultipleSelection({
    selectedItems,
    onStateChange({ selectedItems: newSelectedItems, type }) {
      switch (type) {
        case useMultipleSelection.stateChangeTypes.SelectedItemKeyDownBackspace:
        case useMultipleSelection.stateChangeTypes.SelectedItemKeyDownDelete:
        case useMultipleSelection.stateChangeTypes.DropdownKeyDownBackspace:
        case useMultipleSelection.stateChangeTypes.FunctionRemoveSelectedItem:
          if (newSelectedItems) {
            setSelectedItems(newSelectedItems);
          }
          break;
        default:
          break;
      }
    }
  });
  const {
    isOpen,
    getToggleButtonProps,
    getLabelProps,
    getMenuProps,
    getInputProps,
    highlightedIndex,
    getItemProps,
    selectedItem
  } = useCombobox({
    items,
    defaultHighlightedIndex: 0, // after selection, highlight the first item.
    selectedItem: null,
    inputValue,
    stateReducer(state, actionAndChanges) {
      const { changes, type } = actionAndChanges;

      switch (type) {
        case useCombobox.stateChangeTypes.InputKeyDownEnter:
        case useCombobox.stateChangeTypes.ItemClick:
          return {
            ...changes,
            isOpen: true, // keep the menu open after selection.
            highlightedIndex: 0 // with the first option highlighted.
          };
        default:
          return changes;
      }
    },
    onStateChange({ inputValue: newInputValue, type, selectedItem: newSelectedItem }) {
      switch (type) {
        case useCombobox.stateChangeTypes.InputKeyDownEnter:
        case useCombobox.stateChangeTypes.ItemClick:
        case useCombobox.stateChangeTypes.InputBlur:
          if (newSelectedItem) {
            setSelectedItems([...selectedItems, newSelectedItem]);
            setInputValue('');
          }
          break;

        case useCombobox.stateChangeTypes.InputChange:
          setInputValue(newInputValue ?? '');

          break;
        default:
          break;
      }
    }
  });

  return (
    <Box w="full">
      <VStack w="full" align="stretch" alignItems="flex-start" spacing="8px">
        <FormLabel
          display="flex"
          m={0}
          w="full"
          h={handleSetCustomSelectedItem ? '28px' : '20px'}
          justifyContent="space-between"
          alignItems="center"
          {...getLabelProps()}
        >
          <Flex gap="3.5px" alignItems="flex-start">
            <Text
              whiteSpace="nowrap"
              fontSize="14px"
              fontStyle="normal"
              fontWeight={500}
              lineHeight="20px"
              letterSpacing="0.1px"
            >
              {t('common:channelForm.models')}
            </Text>
            <Text
              color="red.600"
              fontSize="14px"
              fontStyle="normal"
              fontWeight={500}
              lineHeight="20px"
              letterSpacing="0.1px"
            >
              *
            </Text>
          </Flex>
          {handleSetCustomSelectedItem && (
            <CreateModelMenu
              onSuccess={handleSetCustomSelectedItem}
              buttonProps={{
                fontSize: '14px',
                fontStyle: 'normal',
                fontWeight: 500,
                lineHeight: '20px',
                letterSpacing: '0.1px'
              }}
            />
          )}
        </FormLabel>

        <Box
          w="full"
          bg="myGray.50"
          borderRadius="6px"
          border="1px solid"
          borderColor="myGray.200"
          p="8px"
        >
          <Flex wrap="wrap" gap="8px" alignItems="center">
            {selectedItems.map((selectedItemForRender, index) => (
              <Box
                key={`selected-item-${index}`}
                bg="myGray.200"
                borderRadius="6px"
                px="6px"
                py="4px"
                _focus={{ bg: 'primary.100' }}
                {...getSelectedItemProps({
                  selectedItem: selectedItemForRender,
                  index: index
                })}
              >
                <Flex alignItems="center" gap="8px">
                  {handleSelectedItemDisplay(selectedItemForRender)}
                  <Box
                    h="16px"
                    w="16px"
                    borderRadius="4px"
                    alignItems="center"
                    justifyContent="center"
                    cursor="pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSelectedItem(selectedItemForRender);
                    }}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                    >
                      <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M12.2083 3.79145C12.4686 4.0518 12.4686 4.47391 12.2083 4.73426L8.94289 7.99967L12.2083 11.2651C12.4687 11.5255 12.4687 11.9476 12.2083 12.2079C11.948 12.4683 11.5259 12.4683 11.2655 12.2079L8.00008 8.94248L4.73463 12.2079C4.47428 12.4683 4.05217 12.4683 3.79182 12.2079C3.53147 11.9476 3.53147 11.5255 3.79182 11.2651L7.05727 7.99967L3.79186 4.73426C3.53152 4.47391 3.53151 4.0518 3.79186 3.79145C4.05221 3.5311 4.47432 3.5311 4.73467 3.79145L8.00008 7.05686L11.2655 3.79145C11.5258 3.5311 11.9479 3.5311 12.2083 3.79145Z"
                        fill="#667085"
                      />
                    </svg>
                  </Box>
                </Flex>
              </Box>
            ))}

            <Flex flex={1} gap="4px">
              <Input
                variant="unstyled"
                fontSize="12px"
                color="myGray.900"
                placeholder={t('common:channelFormPlaceholder.model')}
                fontWeight={400}
                lineHeight="16px"
                letterSpacing="0.048px"
                {...getInputProps(getDropdownProps({ preventKeyAction: isOpen }))}
              />

              <Button
                right={0}
                h="32px"
                w="32px"
                variant="unstyled"
                display="flex"
                alignItems="center"
                justifyContent="center"
                {...getToggleButtonProps()}
              >
                {isOpen ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="17"
                    height="16"
                    viewBox="0 0 17 16"
                    fill="none"
                  >
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M4.32148 10.4715C4.58183 10.7318 5.00394 10.7318 5.26429 10.4715L8.79289 6.94289L12.3215 10.4715C12.5818 10.7318 13.0039 10.7318 13.2643 10.4715C13.5246 10.2111 13.5246 9.78903 13.2643 9.52868L9.26429 5.52868C9.00394 5.26833 8.58183 5.26833 8.32148 5.52868L4.32148 9.52868C4.06113 9.78903 4.06113 10.2111 4.32148 10.4715Z"
                      fill="#667085"
                    />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="17"
                    height="16"
                    viewBox="0 0 17 16"
                    fill="none"
                  >
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M4.32148 5.52851C4.58183 5.26816 5.00394 5.26816 5.26429 5.52851L8.79289 9.05711L12.3215 5.52851C12.5818 5.26816 13.0039 5.26816 13.2643 5.52851C13.5246 5.78886 13.5246 6.21097 13.2643 6.47132L9.26429 10.4713C9.00394 10.7317 8.58183 10.7317 8.32148 10.4713L4.32148 6.47132C4.06113 6.21097 4.06113 5.78886 4.32148 5.52851Z"
                      fill="#667085"
                    />
                  </svg>
                )}
              </Button>
            </Flex>
          </Flex>
        </Box>
      </VStack>

      <List
        position="absolute"
        mt="2px"
        w="full"
        py="6px"
        pl="6px"
        pr="6px"
        bg="white"
        alignItems="flex-start"
        maxH="60"
        overflowY="auto"
        zIndex="10"
        borderRadius="6px"
        border="1px solid"
        borderColor="myGray.200"
        display={isOpen && items.length ? 'block' : 'none'}
        {...getMenuProps()}
      >
        {isOpen &&
          items.map((item, index) => (
            <ListItem
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
              fontSize="12px"
              fontStyle="normal"
              lineHeight="16px"
              letterSpacing="0.5px"
              _hover={{ bg: 'myGray.50' }}
              {...getItemProps({ item, index })}
            >
              {handleDropdownItemDisplay(item)}
            </ListItem>
          ))}
      </List>
    </Box>
  );
};
