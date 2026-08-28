import { Flex } from '@chakra-ui/react';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { Description } from './FormLabel';

function SecondTitle({ title, description }: { title: string; description?: string }) {
  return (
    <Flex id={title} color={'primary.600'} px={6} pt={[6, 8]} pb={2} alignItems={'center'}>
      <MyTag fontSize={'md'} type="borderFill" mr="2">
        {title}
      </MyTag>
      {description && <Description description={description} />}
    </Flex>
  );
}

export default SecondTitle;
