import React, { useCallback, useRef } from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import type { EditFieldModalProps } from './type';
import { useTranslation } from 'next-i18next';
import {
  Box,
  Button,
  Flex,
  Input,
  ModalBody,
  ModalFooter,
  Switch,
  Textarea
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { defaultEditFormData } from './constants';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io.d';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '@/pages/app/detail/components/WorkflowComponents/context';
import { fnValueTypeSelect } from '@/web/core/workflow/constants/dataType';

const EditFieldModal = ({
  defaultValue = defaultEditFormData,
  nodeId,
  onClose
}: EditFieldModalProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const { register, setValue, handleSubmit, watch } = useForm<FlowNodeInputItemType>({
    defaultValues: defaultValue
  });
  const valueType = watch('valueType');

  const { mutate: onclickSubmit } = useRequest({
    mutationFn: async (e: FlowNodeInputItemType) => {
      const inputConfig: FlowNodeInputItemType = {
        ...e,
        label: e.key
      };
      if (defaultValue.key) {
        // edit
        onChangeNode({
          nodeId,
          type: 'replaceInput',
          key: defaultValue.key,
          value: inputConfig
        });
      } else {
        // create
        onChangeNode({
          nodeId,
          type: 'addInput',
          index: 1,
          value: {
            ...e,
            label: e.key
          }
        });
      }
      onClose();
    }
  });
  const onclickSubmitError = useCallback(
    (e: Object) => {
      for (const item of Object.values(e)) {
        if (item.message) {
          toast({
            status: 'warning',
            title: item.message
          });
          break;
        }
      }
    },
    [toast]
  );

  return (
    <MyModal isOpen iconSrc="modal/edit" title={'工具字段参数配置'} onClose={onClose}>
      <ModalBody>
        <Flex alignItems={'center'} mb={5}>
          <Box flex={'0 0 80px'}>{t('common.Require Input')}</Box>
          <Switch {...register('required')} />
        </Flex>
        <Flex alignItems={'center'} mb={5}>
          <Box flex={'0 0 80px'}>{t('core.module.Data Type')}</Box>
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
        <Flex alignItems={'center'} mb={5}>
          <Box flex={'0 0 80px'}>{t('core.module.Field Name')}</Box>
          <Input
            bg={'myGray.50'}
            {...register('key', {
              required: true,
              pattern: {
                value: /^[a-zA-Z]+[0-9]*$/,
                message: '字段key必须是纯英文字母或数字，并且不能以数字开头。'
              }
            })}
          />
        </Flex>
        <Box mb={5}>
          <Box flex={'0 0 80px'}>{t('core.module.Field Description')}</Box>
          <Textarea
            bg={'myGray.50'}
            rows={5}
            {...register('toolDescription', {
              required: true
            })}
          />
        </Box>
      </ModalBody>
      <ModalFooter>
        <Button variant={'whiteBase'} mr={2} onClick={onClose}>
          {t('common.Close')}
        </Button>
        <Button onClick={handleSubmit((data) => onclickSubmit(data), onclickSubmitError)}>
          {t('common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default React.memo(EditFieldModal);
