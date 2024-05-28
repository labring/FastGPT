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
import MyTooltip from '@/components/MyTooltip';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { fnValueTypeSelect } from '@/web/core/workflow/constants/dataType';

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
          <Flex alignItems={'center'} flex={['0 0 80px', '0 0 100px']}>
            {t('core.module.extract.Required')}
            <MyTooltip label={t('core.module.extract.Required Description')} forceShow>
              <QuestionOutlineIcon ml={1} />
            </MyTooltip>
          </Flex>
          <Switch {...register('required')} />
        </Flex>
        {required && (
          <Flex mt={5} alignItems={'center'}>
            <Box flex={['0 0 80px', '0 0 100px']}>{t('core.module.Default value')}</Box>
            <Input
              bg={'myGray.50'}
              placeholder={t('core.module.Default value placeholder')}
              {...register('defaultValue')}
            />
          </Flex>
        )}

        <Flex alignItems={'center'} mt={5}>
          <Box flex={['0 0 80px', '0 0 100px']}>{t('core.module.Data Type')}</Box>
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
          <Box flex={['0 0 80px', '0 0 100px']}>{t('Field name')}</Box>
          <Input
            bg={'myGray.50'}
            placeholder="name/age/sql"
            {...register('key', { required: true })}
          />
        </Flex>
        <Flex mt={5} alignItems={'center'}>
          <Box flex={['0 0 80px', '0 0 100px']}>{t('core.module.Field Description')}</Box>
          <Input
            bg={'myGray.50'}
            placeholder={t('core.module.extract.Field Description Placeholder')}
            {...register('desc', { required: true })}
          />
        </Flex>
        {(valueType === 'string' || valueType === 'number') && (
          <Box mt={5}>
            <Flex alignItems={'center'}>
              {t('core.module.extract.Enum Value')}({t('common.choosable')})
              <MyTooltip label={t('core.module.extract.Enum Description')} forceShow>
                <QuestionOutlineIcon ml={1} />
              </MyTooltip>
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
