import React from 'react';
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
import type { ContextExtractAgentItemType } from '@fastgpt/global/core/workflow/type/index.d';
import { useForm } from 'react-hook-form';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { fnValueTypeSelect } from '@/web/core/workflow/constants/dataType';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';

export const defaultField: ContextExtractAgentItemType = {
  valueType: 'string',
  required: false,
  defaultValue: '',
  desc: '',
  key: '',
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
  const { register, setValue, handleSubmit, watch } = useForm<ContextExtractAgentItemType>({
    defaultValues: defaultField
  });
  const required = watch('required');
  const valueType = watch('valueType');

  return (
    <MyModal
      isOpen={true}
      iconSrc="/imgs/workflow/extract.png"
      title={t('core.module.extract.Field Setting Title')}
      onClose={onClose}
      w={['90vw', '500px']}
    >
      <ModalBody>
        <Flex mt={2} alignItems={'center'}>
          <Flex alignItems={'center'} flex={['1 0 80px', '1 0 100px']}>
            <FormLabel>{t('core.module.extract.Required')}</FormLabel>
            <QuestionTip ml={1} label={t('core.module.extract.Required Description')}></QuestionTip>
          </Flex>
          <Switch {...register('required')} />
        </Flex>
        {required && (
          <Flex mt={5} alignItems={'center'}>
            <FormLabel flex={['0 0 80px', '0 0 100px']}>{t('core.module.Default value')}</FormLabel>
            <Input
              bg={'myGray.50'}
              placeholder={t('core.module.Default value placeholder')}
              {...register('defaultValue')}
            />
          </Flex>
        )}

        <Flex alignItems={'center'} mt={5}>
          <FormLabel flex={['0 0 80px', '0 0 100px']}>{t('core.module.Data Type')}</FormLabel>
          <Box flex={'1 0 0'}>
            <MySelect
              list={fnValueTypeSelect}
              value={valueType}
              onchange={(e: any) => {
                setValue('valueType', e);
              }}
            />
          </Box>
        </Flex>

        <Flex mt={5} alignItems={'center'}>
          <FormLabel flex={['0 0 80px', '0 0 100px']}>{t('Field name')}</FormLabel>
          <Input
            bg={'myGray.50'}
            placeholder="name/age/sql"
            {...register('key', { required: true })}
          />
        </Flex>
        <Flex mt={5} alignItems={'center'}>
          <FormLabel flex={['0 0 80px', '0 0 100px']}>
            {t('core.module.Field Description')}
          </FormLabel>
          <Input
            bg={'myGray.50'}
            placeholder={t('core.module.extract.Field Description Placeholder')}
            {...register('desc', { required: true })}
          />
        </Flex>
        {(valueType === 'string' || valueType === 'number') && (
          <Box mt={5}>
            <Flex alignItems={'center'}>
              <FormLabel>
                {t('core.module.extract.Enum Value')}({t('common.choosable')})
              </FormLabel>
              <QuestionTip ml={1} label={t('core.module.extract.Enum Description')}></QuestionTip>
            </Flex>

            <Textarea
              rows={5}
              bg={'myGray.50'}
              placeholder={'apple\npeach\nwatermelon'}
              {...register('enum')}
            />
          </Box>
        )}
      </ModalBody>

      <ModalFooter>
        <Button onClick={handleSubmit(onSubmit)}>{t('common.Confirm')}</Button>
      </ModalFooter>
    </MyModal>
  );
};

export default React.memo(ExtractFieldModal);
