import React, { useState, useCallback } from 'react';
import { Box, Input, Textarea, type BoxProps } from '@chakra-ui/react';

export type InlineEditProps = BoxProps & {
  value: string;
  onSave: (val: string) => boolean | void;
  type?: 'input' | 'textarea';
  maxLength?: number;
  placeholder?: string;
  innerH?: BoxProps['h'];
  noOfLines?: number;

  // Custom display element
  renderDisplay?: (val: string) => React.ReactNode;
};

export const InlineEdit = React.memo(function InlineEdit({
  value,
  onSave,
  type = 'input',
  maxLength,
  placeholder,
  innerH,
  noOfLines,
  renderDisplay,
  ...rest
}: InlineEditProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [prevValue, setPrevValue] = useState(value);
  const [tempValue, setTempValue] = useState(value);

  // Sync state during render
  if (value !== prevValue) {
    setPrevValue(value);
    setTempValue(value);
  }

  const handleFinishEdit = useCallback(() => {
    const success = onSave(tempValue);
    if (success === false) {
      setTempValue(value);
    }
    setIsEditing(false);
  }, [onSave, tempValue, value]);

  const handleCancelEdit = useCallback(() => {
    setTempValue(value);
    setIsEditing(false);
  }, [value]);

  if (isEditing) {
    return (
      <Box
        className="nodrag"
        display={'grid'}
        w={'100%'}
        minW={0}
        position={'relative'}
        bg={'white'}
        borderRadius={'sm'}
        border={'1px solid'}
        borderColor={'primary.500'}
        color={type === 'input' ? 'myGray.900' : 'myGray.500'}
        {...rest}
      >
        {type === 'input' ? (
          <>
            <Box
              gridArea={'1 / 1 / 2 / 2'}
              fontSize={'inherit'}
              fontWeight={'inherit'}
              color={'transparent'}
              noOfLines={1}
              wordBreak={'break-all'}
              py={0}
              px={rest.px}
              h={innerH}
              lineHeight={'inherit'}
              pointerEvents={'none'}
              userSelect={'none'}
              whiteSpace={'pre'}
            >
              {tempValue || ' '}
            </Box>
            <Input
              gridArea={'1 / 1 / 2 / 2'}
              w={'100%'}
              h={innerH}
              lineHeight={'inherit'}
              py={0}
              px={rest.px}
              fontSize={'inherit'}
              fontWeight={'inherit'}
              color={'inherit'}
              variant={'unstyled'}
              value={tempValue}
              placeholder={placeholder}
              maxLength={maxLength}
              onChange={(e) => setTempValue(e.target.value)}
              autoFocus
              onBlur={handleFinishEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleFinishEdit();
                } else if (e.key === 'Escape') {
                  handleCancelEdit();
                }
              }}
            />
          </>
        ) : (
          <>
            <Box
              gridArea={'1 / 1 / 2 / 2'}
              fontSize={'inherit'}
              lineHeight={'inherit'}
              color={'transparent'}
              whiteSpace={'pre-wrap'}
              wordBreak={'break-all'}
              p={0}
              m={0}
              minH={rest.minH}
              pointerEvents={'none'}
              userSelect={'none'}
            >
              {tempValue + ' '}
            </Box>
            <Textarea
              value={tempValue}
              placeholder={placeholder}
              maxLength={maxLength}
              onChange={(e) => setTempValue(e.target.value)}
              autoFocus
              onBlur={handleFinishEdit}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  handleCancelEdit();
                }
              }}
              variant={'unstyled'}
              gridArea={'1 / 1 / 2 / 2'}
              w={'100%'}
              h={'100%'}
              resize={'none'}
              overflow={'hidden'}
              p={0}
              m={0}
              fontSize={'inherit'}
              lineHeight={'inherit'}
              color={'inherit'}
              wordBreak={'break-all'}
            />
          </>
        )}
      </Box>
    );
  }

  return (
    <Box
      cursor={'pointer'}
      onClick={() => setIsEditing(true)}
      title={value}
      w={'100%'}
      minW={0}
      maxW={'100%'}
      noOfLines={noOfLines ?? (type === 'input' ? 1 : undefined)}
      whiteSpace={type === 'textarea' ? 'pre-wrap' : undefined}
      wordBreak={'break-all'}
      borderRadius={'sm'}
      border={'1px solid transparent'}
      _hover={{
        bg: 'myGray.25',
        borderColor: 'myGray.100'
      }}
      sx={
        type === 'input'
          ? {
              '& > div': {
                display: 'inline'
              }
            }
          : undefined
      }
      color={type === 'input' ? 'myGray.900' : 'myGray.500'}
      {...rest}
    >
      {renderDisplay ? renderDisplay(value) : value || placeholder || ''}
    </Box>
  );
});

export default InlineEdit;
