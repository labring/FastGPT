import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  ModalFooter,
  ModalBody,
  Flex,
  Switch,
  Input,
  Textarea
} from '@chakra-ui/react';
import type { ContextExtractAgentItemType } from '@fastgpt/global/core/module/type';
import { useForm } from 'react-hook-form';
import MyModal from '@/components/MyModal';
import { useTranslation } from 'next-i18next';
import MyTooltip from '@/components/MyTooltip';
import { QuestionOutlineIcon } from '@chakra-ui/icons';

export const defaultField = {
  desc: '',
  key: '',
  required: true,
  enum: ''
};

const ExtractFieldModal = ({
  defaultField,
  onClose,
  onSubmit
}: {
  defaultField: ContextExtractAgentItemType;
  onClose: () => void;
  onSubmit: (data: ContextExtractAgentItemType) => void;
}) => {
  const { t } = useTranslation();
  const { register, handleSubmit } = useForm<ContextExtractAgentItemType>({
    defaultValues: defaultField
  });

  return (
    <MyModal
      isOpen={true}
      iconSrc="/imgs/module/extract.png"
      title={t('core.module.extract.Field Setting Title')}
      onClose={onClose}
    >
      <ModalBody>
        <Flex alignItems={'center'}>
          <Box flex={'0 0 70px'}>{t('common.Require Input')}</Box>
          <Switch {...register('required')} />
        </Flex>
        <Flex mt={5} alignItems={'center'}>
          <Box flex={'0 0 70px'}>{t('core.module.Field key')}</Box>
          <Input placeholder="name/age/sql" {...register('key', { required: true })} />
        </Flex>
        <Flex mt={5} alignItems={'center'}>
          <Box flex={'0 0 70px'}>{t('core.module.Field Description')}</Box>
          <Input
            placeholder={t('core.module.extract.Field Description Placeholder')}
            {...register('desc', { required: true })}
          />
        </Flex>
        <Box mt={5}>
          <Flex alignItems={'center'}>
            {t('core.module.extract.Enum Value')}({t('common.choosable')})
            <MyTooltip label={t('core.module.extract.Enum Description')} forceShow>
              <QuestionOutlineIcon ml={1} />
            </MyTooltip>
          </Flex>

          <Textarea rows={5} placeholder={'apple\npeach\nwatermelon'} {...register('enum')} />
        </Box>
      </ModalBody>

      <ModalFooter>
        <Button variant={'whiteBase'} mr={3} onClick={onClose}>
          {t('common.Close')}
        </Button>
        <Button onClick={handleSubmit(onSubmit)}>{t('common.Confirm')}</Button>
      </ModalFooter>
    </MyModal>
  );
};

export default React.memo(ExtractFieldModal);
