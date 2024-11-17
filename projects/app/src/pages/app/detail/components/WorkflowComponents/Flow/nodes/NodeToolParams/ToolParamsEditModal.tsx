import { toolValueTypeList } from '@fastgpt/global/core/workflow/constants';
import { Box, Button, Flex, Input, ModalBody, ModalFooter, Textarea } from '@chakra-ui/react';
import { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MySelect from '@fastgpt/web/components/common/MySelect';
import React, { useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import { defaultEditFormData } from '../render/RenderToolInput/EditFieldModal';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../../context';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';

const ToolParamsEditModal = ({
  defaultValue = defaultEditFormData,
  nodeId,
  onClose
}: {
  defaultValue: FlowNodeInputItemType;
  nodeId: string;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const { register, setValue, handleSubmit, watch } = useForm<FlowNodeInputItemType>({
    defaultValues: defaultValue
  });
  const valueType = watch('valueType');

  const { runAsync: onClickSubmit } = useRequest2(
    async (e: FlowNodeInputItemType) => {
      e.key = e.key.trim();

      const inputConfig: FlowNodeInputItemType = {
        ...e,
        description: e.toolDescription,
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
        onChangeNode({
          nodeId,
          type: 'replaceOutput',
          key: defaultValue.key,
          value: {
            ...e,
            id: e.key,
            label: e.key,
            type: FlowNodeOutputTypeEnum.static
          }
        });
      } else {
        // create
        onChangeNode({
          nodeId,
          type: 'addInput',
          value: {
            ...e,
            label: e.key
          }
        });
        onChangeNode({
          nodeId,
          type: 'addOutput',
          value: {
            ...e,
            id: e.key,
            label: e.key,
            type: FlowNodeOutputTypeEnum.static
          }
        });
      }
      onClose();
    },
    {
      onSuccess: () => {
        onClose();
      }
    }
  );

  const onClickSubmitError = useCallback(
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

  const showEnumInput = useMemo(() => {
    return !(
      valueType === WorkflowIOValueTypeEnum.boolean ||
      valueType === WorkflowIOValueTypeEnum.arrayBoolean
    );
  }, [valueType]);

  return (
    <MyModal isOpen iconSrc="modal/edit" title={t('workflow:tool_field')} onClose={onClose}>
      <ModalBody>
        <Flex alignItems={'center'} mb={5}>
          <FormLabel flex={'0 0 80px'}>{t('common:core.module.Data Type')}</FormLabel>
          <Box flex={'1 0 0'}>
            <MySelect
              list={toolValueTypeList}
              value={valueType}
              onchange={(e: any) => {
                setValue('valueType', e);
              }}
            />
          </Box>
        </Flex>
        <Flex alignItems={'center'} mb={5}>
          <FormLabel flex={'0 0 80px'}>{t('workflow:tool_params.params_name')}</FormLabel>
          <Input
            bg={'myGray.50'}
            {...register('key', {
              required: true,
              pattern: {
                value: /^[a-zA-Z]+[0-9]*$/,
                message: t('common:info.felid_message')
              }
            })}
            placeholder={t('workflow:tool_params.params_name_placeholder')}
          />
        </Flex>
        <Flex alignItems={'center'} mb={showEnumInput ? 5 : 0}>
          <FormLabel flex={'0 0 80px'}>{t('workflow:tool_params.params_description')}</FormLabel>
          <Input
            bg={'myGray.50'}
            {...register('toolDescription', {
              required: true
            })}
            placeholder={t('workflow:tool_params.params_description_placeholder')}
          />
        </Flex>
        {showEnumInput && (
          <Box>
            <Flex alignItems={'center'} mb={2}>
              <FormLabel>{t('workflow:tool_params.enum_values')}</FormLabel>
              <QuestionTip label={t('workflow:tool_params.enum_values_tip')} />
            </Flex>
            <Textarea
              bg={'myGray.50'}
              {...register('enum')}
              placeholder={t('workflow:tool_params.enum_placeholder')}
            />
          </Box>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant={'whiteBase'} mr={2} onClick={onClose}>
          {t('common:common.Close')}
        </Button>
        <Button onClick={handleSubmit((data) => onClickSubmit(data), onClickSubmitError)}>
          {t('common:common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default React.memo(ToolParamsEditModal);
