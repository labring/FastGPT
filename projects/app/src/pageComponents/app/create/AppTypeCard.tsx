import type { CreateAppType } from '@/pages/dashboard/create';
import type { createAppTypeMap } from '../constants';
import { Box, Card } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';

const AppTypeCard = ({
  selectedAppType,
  onClick,
  option
}: {
  selectedAppType: CreateAppType;
  onClick: () => void;
  option: (typeof createAppTypeMap)[CreateAppType];
}) => {
  const { t } = useTranslation();
  return (
    <Card
      key={option.type}
      p={4}
      borderRadius={'10px'}
      border={'1px solid'}
      {...(selectedAppType === option.type
        ? {
            borderColor: 'primary.300'
          }
        : {
            borderColor: 'myGray.200'
          })}
      cursor={'pointer'}
      userSelect={'none'}
      onClick={onClick}
      boxShadow={'none'}
      _hover={{
        boxShadow: '0 4px 10px 0 rgba(19, 51, 107, 0.08), 0 0 1px 0 rgba(19, 51, 107, 0.08)'
      }}
    >
      <MyIcon name={option.icon as any} w={'6'} />
      <Box fontWeight={'medium'} color={'myGray.900'} mt={2}>
        {t(option.title)}
      </Box>
      <Box fontSize={'mini'} color={'myGray.500'} mt={0.5} lineHeight={'16px'}>
        {t(option.intro)}
      </Box>
    </Card>
  );
};

export default AppTypeCard;
