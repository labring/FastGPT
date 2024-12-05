import { Box } from '@chakra-ui/react';
import React from 'react';
import { useTranslation } from 'next-i18next';
import { formatTimeToChatItemTime } from '@fastgpt/global/common/string/time';
import dayjs from 'dayjs';

const TimeBox = ({ time }: { time: Date }) => {
  const { t } = useTranslation();

  return (
    <Box w={'100%'} fontSize={'mini'} textAlign={'center'} color={'myGray.500'} fontWeight={'400'}>
      {t(formatTimeToChatItemTime(time) as any, {
        time: dayjs(time).format('HH#mm')
      }).replace('#', ':')}
    </Box>
  );
};

export default TimeBox;
