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
    border: '1px solid',
    borderColor: 'myGray.150',
    borderRadius: 'sm',
    w: 6,
    h: 6,
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
      <MyIcon name={isUp ? `common/solidChevronUp` : `common/solidChevronDown`} w={'18px'} />
    </Flex>
  );
};

export default NavButton;
