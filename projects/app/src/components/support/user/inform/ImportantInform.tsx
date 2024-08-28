import { UserInformSchema } from '@fastgpt/global/support/user/inform/type';
import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { CloseIcon } from '@chakra-ui/icons';
import { readInform } from '@/web/support/user/inform/api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';

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
          bg={'primary.015'}
          py={3}
          px={5}
          fontSize={'md'}
          borderRadius={'lg'}
          boxShadow={'4'}
          borderWidth={'1px'}
          borderColor={'borderColor.base'}
          minW={['200px', '400px']}
          alignItems={'flex-start'}
          mb={3}
          backdropFilter={'blur(30px)'}
        >
          <MyIcon name={'support/user/informLight'} w={'16px'} mr={2} />
          <Box flex={'1 0 0'}>
            <Box fontWeight={'bold'}>{inform.title}</Box>
            <Box fontSize={'sm'}>{inform.content}</Box>
          </Box>
          <CloseIcon
            cursor={'pointer'}
            _hover={{
              color: 'primary.700'
            }}
            w={'12px'}
            onClick={() => onClickClose(inform._id)}
          />
        </Flex>
      ))}
    </Box>
  );
};

export default React.memo(ImportantInform);
