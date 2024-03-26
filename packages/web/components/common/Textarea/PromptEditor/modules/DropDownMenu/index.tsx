import { Box, Flex } from '@chakra-ui/react';
import { EditorVariablePickerType } from '../../type';
import MyIcon from '../../../../Icon';
import React, { useCallback, useEffect } from 'react';

export default function DropDownMenu({
  variables,
  setDropdownValue
}: {
  variables: EditorVariablePickerType[];
  setDropdownValue?: (value: string) => void;
}) {
  const [highlightedIndex, setHighlightedIndex] = React.useState(0);

  const handleKeyDown = useCallback(
    (event: any) => {
      if (event.keyCode === 38) {
        setHighlightedIndex((prevIndex) => Math.max(prevIndex - 1, 0));
      } else if (event.keyCode === 40) {
        setHighlightedIndex((prevIndex) => Math.min(prevIndex + 1, variables.length - 1));
      } else if (event.keyCode === 13 && variables[highlightedIndex]?.key) {
        setDropdownValue?.(variables[highlightedIndex].key);
      }
    },
    [highlightedIndex, variables]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  return variables.length ? (
    <Box
      bg={'white'}
      boxShadow={'lg'}
      borderWidth={'1px'}
      borderColor={'borderColor.base'}
      p={2}
      borderRadius={'md'}
      position={'absolute'}
      top={'100%'}
      w={'auto'}
      zIndex={99999}
      maxH={'300px'}
      overflow={'auto'}
      className="nowheel"
    >
      {variables.map((item, index) => (
        <Flex
          alignItems={'center'}
          as={'li'}
          key={item.key}
          px={4}
          py={2}
          borderRadius={'sm'}
          cursor={'pointer'}
          maxH={'300px'}
          overflow={'auto'}
          _notLast={{
            mb: 2
          }}
          {...(highlightedIndex === index
            ? {
                bg: 'primary.50',
                color: 'primary.600'
              }
            : {
                bg: 'white',
                color: 'myGray.600'
              })}
          onMouseDown={(e) => {
            e.preventDefault();

            setDropdownValue?.(item.key);
          }}
          onMouseEnter={() => {
            setHighlightedIndex(index);
          }}
        >
          <MyIcon name={(item.icon as any) || 'core/modules/variable'} w={'14px'} />
          <Box ml={2} fontSize={'sm'}>
            {item.key}
            {item.key !== item.label && `(${item.label})`}
          </Box>
        </Flex>
      ))}
    </Box>
  ) : null;
}
