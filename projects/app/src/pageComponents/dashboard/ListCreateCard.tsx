import React from 'react';
import { Box } from '@chakra-ui/react';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';

const ListCreateCard = ({ onClick, label }: { onClick: () => void; label?: string }) => {
  const { t } = useTranslation();

  return (
    <MyBox
      py={4}
      px={5}
      cursor={'pointer'}
      border={'base'}
      bg={'white'}
      borderRadius={'10px'}
      position={'relative'}
      display={'flex'}
      flexDirection={'column'}
      _hover={{
        '& .create-box': {
          display: 'flex'
        }
      }}
      onClick={onClick}
    >
      <Box color={'myGray.900'} fontWeight={'medium'}>
        {label ?? t('common:new_create')}
      </Box>
      <Box
        mt={4}
        mb={2}
        h={'100%'}
        w={'100%'}
        display={'flex'}
        alignItems={'center'}
        justifyContent={'center'}
        position={'relative'}
        flex={'1 0 56px'}
      >
        <Box
          className="create-box"
          display={'none'}
          position={'absolute'}
          top={'1px'}
          left={'1px'}
          right={'1px'}
          bottom={'1px'}
          bg={'primary.50'}
          borderRadius={'14px'}
        />
        <Box
          w={'100%'}
          h={'100%'}
          display={'flex'}
          alignItems={'center'}
          justifyContent={'center'}
          sx={{
            background: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25' viewBox='0 0 330 56' preserveAspectRatio='none'%3E%3Crect x='0.5' y='0.5' width='329' height='55' rx='12' fill='none' stroke='%237895FE' stroke-width='1' stroke-dasharray='6 6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat center`,
            backgroundSize: '100% 100%'
          }}
        >
          <MyIcon name={'common/addLight'} w={8} color={'#7895FE'} zIndex={1} />
        </Box>
      </Box>
    </MyBox>
  );
};

export default ListCreateCard;
