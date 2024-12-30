import MyIcon from '@fastgpt/web/components/common/Icon';
import type { IconNameType } from '@fastgpt/web/components/common/Icon/type';

function IconButton({ name, onClick }: { name: IconNameType; onClick: () => void }) {
  return (
    <MyIcon
      name={name}
      w={'1rem'}
      h={'1rem'}
      transition={'background 0.1s'}
      cursor={'pointer'}
      p="1"
      rounded={'sm'}
      _hover={{
        bg: 'myGray.05',
        color: 'primary.600'
      }}
      onClick={onClick}
    />
  );
}

export default IconButton;
