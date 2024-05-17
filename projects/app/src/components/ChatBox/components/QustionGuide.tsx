import { Box, BoxProps, Flex } from '@chakra-ui/react';
import { EditorVariablePickerType } from '@fastgpt/web/components/common/Textarea/PromptEditor/type';
import React, { useCallback, useEffect } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useI18n } from '@/web/context/I18n';

export default function QuestionGuide({
  variables,
  setDropdownValue,
  ...props
}: {
  variables: EditorVariablePickerType[];
  setDropdownValue?: (value: string) => void;
} & BoxProps) {
  const [highlightedIndex, setHighlightedIndex] = React.useState(0);
  const { appT } = useI18n();

  const handleKeyDown = useCallback(
    (event: any) => {
      if (event.keyCode === 38) {
        setHighlightedIndex((prevIndex) => Math.max(prevIndex - 1, 0));
      } else if (event.keyCode === 40) {
        setHighlightedIndex((prevIndex) => Math.min(prevIndex + 1, variables.length - 1));
      } else if (event.keyCode === 13 && variables[highlightedIndex]?.key) {
        setDropdownValue?.(variables[highlightedIndex].key);
        event.preventDefault();
      }
    },
    [highlightedIndex, setDropdownValue, variables]
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
      {...props}
    >
      <Flex alignItems={'center'} fontSize={'sm'} color={'myGray.600'} gap={2} mb={2} px={2}>
        <MyIcon name={'union'} />
        <Box>{appT('modules.Input Guide')}</Box>
      </Flex>
      {variables.map((item, index) => (
        <Flex
          alignItems={'center'}
          as={'li'}
          key={item.key}
          px={4}
          py={3}
          borderRadius={'sm'}
          cursor={'pointer'}
          maxH={'300px'}
          overflow={'auto'}
          _notLast={{
            mb: 1
          }}
          {...(highlightedIndex === index
            ? {
                bg: 'primary.50',
                color: 'primary.600'
              }
            : {
                bg: 'myGray.50',
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
          <Box fontSize={'sm'}>
            {item.key}
            {item.key !== item.label && `(${item.label})`}
          </Box>
        </Flex>
      ))}
    </Box>
  ) : null;
}
