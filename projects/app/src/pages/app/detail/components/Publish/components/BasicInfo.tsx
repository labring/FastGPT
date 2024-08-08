import React from 'react';
import { Box, Flex, Input } from '@chakra-ui/react';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { UseFormRegister, UseFormSetValue } from 'react-hook-form';
import { OutLinkEditType } from '@fastgpt/global/support/outLink/type';

function BasicInfo({
  register,
  setValue,
  defaultData
}: {
  register: UseFormRegister<OutLinkEditType<any>>;
  setValue: UseFormSetValue<OutLinkEditType<any>>;
  defaultData: OutLinkEditType<any>;
}) {
  const { t } = useTranslation();
  return (
    <Flex flexDirection="column">
      <Box>{t('publish:basic_info')}</Box>
      <Flex alignItems={'center'} mt="4">
        <Box flex={'0 0 90px'}>{t('common:Name')}</Box>
        <Input
          placeholder={t('publish:feishu_name')}
          maxLength={20}
          {...register('name', {
            required: t('common:common.name_is_empty')
          })}
        />
      </Flex>
      <Flex alignItems={'center'} mt={4}>
        <Flex flex={'0 0 90px'} alignItems={'center'}>
          QPM
          <QuestionTip ml={1} label={t('publish:qpm_tips')}></QuestionTip>
        </Flex>
        <Input
          max={1000}
          {...register('limit.QPM', {
            min: 0,
            max: 1000,
            valueAsNumber: true,
            required: t('publish:qpm_is_empty')
          })}
        />
      </Flex>
      <Flex alignItems={'center'} mt={4}>
        <Flex flex={'0 0 90px'} alignItems={'center'}>
          {t('common:support.outlink.Max usage points')}
          <QuestionTip
            ml={1}
            label={t('common:support.outlink.Max usage points tip')}
          ></QuestionTip>
        </Flex>
        <Input
          {...register('limit.maxUsagePoints', {
            min: -1,
            max: 10000000,
            valueAsNumber: true,
            required: true
          })}
        />
      </Flex>
      <Flex alignItems={'center'} mt={4}>
        <Flex flex={'0 0 90px'} alignItems={'center'}>
          {t('common:common.Expired Time')}
        </Flex>
        <Input
          type="datetime-local"
          defaultValue={
            defaultData.limit?.expiredTime
              ? dayjs(defaultData.limit?.expiredTime).format('YYYY-MM-DDTHH:mm')
              : ''
          }
          onChange={(e) => {
            setValue('limit.expiredTime', new Date(e.target.value));
          }}
        />
      </Flex>
    </Flex>
  );
}

export default BasicInfo;
