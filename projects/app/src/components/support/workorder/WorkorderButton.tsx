import { Box, Flex } from "@chakra-ui/react";
import Icon from "@fastgpt/web/components/common/Icon";
import { useToggle } from "ahooks";
import { useState } from "react";

function WorkorderButton() {
  const [open, setOpen] = useToggle(true)
  return <>{
    open ?
      <Box position='fixed' bottom='20%' right='0' height='62px' width='58px'
        bg='white'
        borderTopLeftRadius='8px'
        borderBottomLeftRadius='8px'
        border={'1px'}
        borderColor={'myGray.25'}
        zIndex={100}
        boxShadow='0px 12px 32px -4px #00175633'
      >
        < Box zIndex={101} width='14px' height='14px' position='relative' left='-6px' top='-6px' borderRadius='full' background='white' border='1px' borderColor={'myGray.25'} _hover={{
          cursor: 'pointer',
        }}
          onClick={() => setOpen.set(false)}
        >
          <Icon name='close' />
        </Box >
        <Flex
          flexDirection='column' justifyItems='center' alignItems='center' cursor='pointer'
        >
          <Icon name="feedback" width="28px" height="28px" />
          <Box fontSize='11px' fontWeight='500'>
            问题反馈
          </Box>
        </Flex>
      </Box >
      : <Box position='fixed' bottom='20%' right='0' height='44px' width='19px'>
        aa
      </Box >
  }</>
}

export default WorkorderButton
