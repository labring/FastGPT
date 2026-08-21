import { Box, Button, type ButtonProps } from '@chakra-ui/react';
import React from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';

type QuickQuestionButtonProps = ButtonProps & {
  children: React.ReactNode;
};

/**
 * Render a preset question with the same inline style as question guide actions.
 */
const QuickQuestionButton = ({ children, ...props }: QuickQuestionButtonProps) => (
  <Button
    type={'button'}
    variant={'unstyled'}
    display={'flex'}
    alignItems={'center'}
    gap={2}
    maxW={'100%'}
    px={['16px', '8px']}
    py={['8px', '4px']}
    borderRadius={'8px'}
    border={'0.5px solid'}
    borderColor={['myGray.250', 'transparent']}
    bg={'transparent'}
    color={'myGray.600'}
    fontSize={'14px'}
    lineHeight={'20px'}
    fontWeight={500}
    cursor={'pointer'}
    _hover={{ bg: 'rgba(17, 24, 36, 0.05)' }}
    {...props}
  >
    <MyIcon name={'common/arrowRight'} w={'14px'} transform={'rotate(-45deg)'} />
    <Box className="textEllipsis">{children}</Box>
  </Button>
);

export default React.memo(QuickQuestionButton);
