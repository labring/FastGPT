import React from 'react';
import {
  IconButton,
  Input,
  InputGroup,
  InputRightElement,
  type InputProps
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';

/** Mask credential values by default, with a neutral inline visibility control. */
function HiddenInput({ isDisabled, isReadOnly, h = '36px', ...props }: InputProps) {
  const [show, setShow] = React.useState(false);
  return (
    <InputGroup h={h}>
      <Input
        {...props}
        h={h}
        pr={10}
        isDisabled={isDisabled}
        isReadOnly={isReadOnly}
        type={show ? 'text' : 'password'}
      />
      <InputRightElement h={'100%'} w={10}>
        <IconButton
          type="button"
          variant="ghost"
          aria-label={show ? 'Hide password' : 'Show password'}
          aria-pressed={show}
          isDisabled={isDisabled}
          minW={6}
          w={6}
          h={6}
          p={1}
          color={'myGray.500'}
          bg={'transparent'}
          _hover={{ bg: 'myGray.100', color: 'myGray.700' }}
          icon={<MyIcon name={show ? 'invisible' : 'visible'} w={4} h={4} />}
          onClick={() => setShow((previous) => !previous)}
        />
      </InputRightElement>
    </InputGroup>
  );
}

export default HiddenInput;
