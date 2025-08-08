import React from 'react';
import { Button, Input, InputGroup, InputRightElement } from '@chakra-ui/react';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
function HiddenInput(props: any) {
  const [show, setShow] = React.useState(false);
  return (
    <>
      <InputGroup>
        <Input {...props} type={show ? 'text' : 'password'} />
        <InputRightElement pointerEvents={'auto'}>
          <MyIconButton
            icon={show ? 'invisible' : 'common/viewLight'}
            onClick={() => setShow(!show)}
          />
        </InputRightElement>
      </InputGroup>
    </>
  );
}

export default HiddenInput;
