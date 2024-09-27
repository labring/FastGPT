import { Flex } from '@chakra-ui/react';
import Tag from '@fastgpt/web/components/common/Tag';
import React from 'react';

type Props = {
  max: number;
  names?: string[];
};

function GroupTags({ max, names }: Props) {
  const [hover, setHover] = React.useState(false);
  const length = names?.length || 0;

  return (
    <Flex
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      flexWrap="wrap"
      rowGap={2}
    >
      {!hover &&
        names?.slice(0, max).map((name, index) => (
          <Tag key={index} colorSchema={'gray'} ml={2}>
            {name.length > 10 ? name.slice(0, 10) + '...' : name}
          </Tag>
        ))}
      {!hover && length > max && (
        <Tag colorSchema={'gray'} ml={2}>
          {'+' + (length - max)}
        </Tag>
      )}

      {hover &&
        names?.map((name, index) => (
          <Tag key={index} colorSchema={'gray'} ml={2}>
            {name}
          </Tag>
        ))}
    </Flex>
  );
}

export default GroupTags;
