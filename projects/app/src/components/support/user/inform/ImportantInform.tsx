import { UserInformSchema } from '@fastgpt/global/support/user/inform/type';
import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { CloseIcon } from '@chakra-ui/icons';
import { readInform } from '@/web/support/user/inform/api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import Markdown from '@/components/Markdown';
const ImportantInform = ({
  informs,
  refetch
}: {
  informs: UserInformSchema[];
  refetch: () => void;
}) => {
  const { mutate: onClickClose } = useRequest({
    mutationFn: async (id: string) => {
      await readInform(id);
    },
    onSuccess: () => {
      refetch();
    },
    errorToast: 'Failed to read the inform'
  });

  return (
    <Box position={'fixed'} top={'3%'} left={'50%'} transform={'translateX(-50%)'} zIndex={99999}>
      {informs.map((inform) => (
        <Flex
          key={inform._id}
          py={4}
          px={5}
          fontSize={'md'}
          borderRadius={'lg'}
          boxShadow={'4'}
          borderWidth={'1px'}
          backgroundColor={'white'}
          borderColor={'borderColor.base'}
          minW={['200px', '400px']}
          alignItems={'flex-start'}
          mb={3}
        >
          <MyIcon
            name={'support/user/informLight'}
            w={5}
            h={5}
            mr={2}
            mt={'2px'}
            color="blue.600"
          />
          <Box flex={'1 0 0'}>
            <Box
              fontWeight="bold"
              fontSize="16px"
              lineHeight="24px"
              letterSpacing="0.15px"
              fontFamily="'PingFang SC', sans-serif"
              color=" #24282C"
            >
              {inform.title}
            </Box>
            <Box
              pt={1}
              fontSize="14px"
              lineHeight="20px"
              letterSpacing="0.25px"
              fontFamily="'PingFang SC', sans-serif"
              fontWeight="400"
              color="#24282C"
            >
              <Markdown source={inform?.content} />
            </Box>
          </Box>
          <Box
            cursor={'pointer'}
            p={1}
            pt={0}
            borderRadius={'4px'}
            _hover={{
              backgroundColor: 'rgba(17, 24, 36, 0.05)'
            }}
            onClick={() => onClickClose(inform._id)}
          >
            <CloseIcon w={'12px'} />
          </Box>
        </Flex>
      ))}
    </Box>
  );
};

export default React.memo(ImportantInform);
