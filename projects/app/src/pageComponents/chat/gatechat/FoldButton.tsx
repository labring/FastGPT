import React from 'react';
import { Flex } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';

interface Props {
  isFolded: boolean;
  onClick: () => void;
  position?: 'sidebar' | 'navbar';
}

const FoldButton = ({ isFolded, onClick, position = 'sidebar' }: Props) => {
  return (
    <Flex
      position={position === 'sidebar' ? 'absolute' : 'relative'}
      right={position === 'sidebar' ? 0 : 'auto'}
      top={position === 'sidebar' ? '50%' : 'auto'}
      transform={position === 'sidebar' ? 'translate(50%,-50%)' : 'none'}
      display={'flex'}
      width={'16px'}
      height={'80px'}
      justifyContent={'center'}
      alignItems={'center'}
      gap={'4px'}
      flexShrink={0}
      borderRadius={'999px'}
      bg={'var(--Gray-Modern-50, #F7F8FA)'}
      boxShadow={
        '0px 4px 10px 0px rgba(19, 51, 107, 0.10), 0px 0px 1px 0px rgba(19, 51, 107, 0.10)'
      }
      cursor={'pointer'}
      transition={'0.2s'}
      zIndex={100}
      opacity={position === 'navbar' ? 1 : isFolded ? 0.8 : 0}
      visibility={position === 'navbar' ? 'visible' : isFolded ? 'visible' : 'hidden'}
      onClick={onClick}
      _hover={{
        opacity: 1
      }}
    >
      <MyIcon
        name={'support/gate/chat/historySlider/chevron-left2'}
        transform={position === 'navbar' ? 'rotate(180deg)' : isFolded ? 'rotate(180deg)' : ''}
        w={'14px'}
        color={'black'}
      />
    </Flex>
  );
};

export default FoldButton;
