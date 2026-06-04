import { Flex } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';

const NavButton = ({
  direction,
  isDisabled,
  onClick
}: {
  direction: 'up' | 'down';
  isDisabled: boolean;
  onClick: () => void;
}) => {
  const isUp = direction === 'up';

  const baseStyles = {
    color: 'myGray.500',
    borderRadius: '6px',
    boxSize: '32px',
    p: '8px',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s'
  };

  const stateStyles = isDisabled
    ? {
        cursor: 'not-allowed',
        opacity: 0.5,
        _hover: {}
      }
    : {
        cursor: 'pointer',
        opacity: 1,
        _hover: { bg: 'myGray.100' },
        onClick
      };

  return (
    <Flex {...baseStyles} {...stateStyles}>
      <MyIcon
        name={'core/chat/chevronDown'}
        w={'16px'}
        h={'16px'}
        transform={isUp ? 'rotate(180deg)' : undefined}
      />
    </Flex>
  );
};

export default NavButton;
