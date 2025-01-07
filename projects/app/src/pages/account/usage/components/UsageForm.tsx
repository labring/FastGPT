import { Box } from '@chakra-ui/react';
import { formatNumber } from '@fastgpt/global/common/math/tools';
import { useTranslation } from 'next-i18next';
import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  TooltipProps
} from 'recharts';
import { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';

export type usageFormType = {
  date: string;
  totalPoints: number;
};

const CustomTooltip = ({ active, payload }: TooltipProps<ValueType, NameType>) => {
  const data = payload?.[0]?.payload as usageFormType;
  const { t } = useTranslation();
  if (active && data) {
    return (
      <Box
        bg={'white'}
        p={3}
        borderRadius={'md'}
        border={'0.5px solid'}
        borderColor={'myGray.200'}
        boxShadow={
          '0px 24px 48px -12px rgba(19, 51, 107, 0.20), 0px 0px 1px 0px rgba(19, 51, 107, 0.20)'
        }
      >
        <Box fontSize={'mini'} color={'myGray.600'} mb={3}>
          {data.date}
        </Box>
        <Box fontSize={'14px'} color={'myGray.900'} fontWeight={'medium'}>
          {`${formatNumber(data.totalPoints)} ${t('account_usage:points')}`}
        </Box>
      </Box>
    );
  }
  return null;
};

const UsageForm = ({ usageData }: { usageData: usageFormType[] }) => {
  return (
    <ResponsiveContainer width="100%" height={424}>
      <LineChart data={usageData} margin={{ top: 10, right: 30, left: -12, bottom: 0 }}>
        <XAxis
          dataKey="date"
          padding={{ left: 40, right: 40 }}
          tickMargin={10}
          tickSize={0}
          tick={{ fontSize: '12px', color: '#667085', fontWeight: '500' }}
        />
        <YAxis
          axisLine={false}
          tickSize={0}
          tickMargin={12}
          tick={{ fontSize: '12px', color: '#667085', fontWeight: '500' }}
        />
        <CartesianGrid
          strokeDasharray="3 3"
          verticalCoordinatesGenerator={(props) => {
            const { width } = props;
            if (width < 500) {
              return [width * 0.2, width * 0.4, width * 0.6, width * 0.8];
            } else {
              return [
                width * 0.125,
                width * 0.25,
                width * 0.375,
                width * 0.5,
                width * 0.625,
                width * 0.75,
                width * 0.875
              ];
            }
          }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Line
          type="monotone"
          dataKey="totalPoints"
          stroke="#5E8FFF"
          strokeWidth={1.5}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

export default React.memo(UsageForm);
