import React from 'react';
import { Button, Input, InputGroup, InputRightElement } from '@chakra-ui/react';
import { ViewOffIcon, ViewIcon } from '@chakra-ui/icons';
function HiddenInput(props: any) {
  const [show, setShow] = React.useState(false);
  return (
    <>
      <InputGroup>
        <Input {...props} type={show ? 'text' : 'password'} />
        <InputRightElement width="4.5rem">
          <Button h="1.75rem" size="sm" onClick={() => setShow(!show)}>
            {show ? <ViewOffIcon /> : <ViewIcon />}
          </Button>
        </InputRightElement>
      </InputGroup>
    </>
  );
}

export default HiddenInput;
