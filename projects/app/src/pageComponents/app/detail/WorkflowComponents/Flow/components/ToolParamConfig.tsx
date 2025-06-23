import React, { useState } from 'react';
import type { FlowNodeInputItemType, InputConfigType } from '@fastgpt/global/core/workflow/type/io';
import { useTranslation } from 'next-i18next';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { Box, Button, Flex, Input, ModalBody, ModalFooter } from '@chakra-ui/react';
import { useBoolean } from 'ahooks';
import MyModal from '@fastgpt/web/components/common/MyModal';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { useForm } from 'react-hook-form';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../context';
import IconButton from '@/pageComponents/account/team/OrgManage/IconButton';
import { SystemToolInputTypeEnum } from '@fastgpt/global/core/app/systemTool/constants';

const ToolConfig = ({ nodeId, inputs }: { nodeId?: string; inputs?: FlowNodeInputItemType[] }) => {
  const { t } = useTranslation();
  const inputConfig = inputs?.find((item) => item.key === NodeInputKeyEnum.systemInputConfig);
  const [isOpen, { setTrue, setFalse }] = useBoolean(false);

  return nodeId && !!inputConfig?.inputList && inputConfig.inputList.length > 0 ? (
    <>
      <Button
        variant={'grayGhost'}
        borderRadius={'md'}
        leftIcon={<MyIcon name={'common/setting'} w={4} />}
        onClick={setTrue}
      >
        {t('workflow:tool_active_config')}
      </Button>
      {isOpen && (
        <ToolParamConfigModal nodeId={nodeId} inputConfig={inputConfig} onClose={setFalse} />
      )}
    </>
  ) : null;
};

export default React.memo(ToolConfig);

const ToolParamConfigModal = ({
  nodeId,
  onClose,
  inputConfig
}: {
  nodeId: string;
  onClose: () => void;
  inputConfig: FlowNodeInputItemType;
}) => {
  const { t } = useTranslation();
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);
  const inputList = inputConfig.inputList || [];

  const [editIndex, setEditIndex] = useState<number>();

  const { getValues, register, handleSubmit } = useForm({
    defaultValues: inputConfig.value || {
      type: SystemToolInputTypeEnum.manual,
      value: inputList.reduce(
        (acc, item) => {
          acc[item.key] = { secret: '', value: '' };
          return acc;
        },
        {} as Record<string, InputConfigType['value']>
      )
    }
  });

  const onSubmit = (data: Record<string, InputConfigType['value']>) => {
    onChangeNode({
      nodeId,
      type: 'updateInput',
      key: inputConfig.key,
      value: {
        ...inputConfig,
        value: data
      }
    });
    onClose();
  };

  return (
    <MyModal
      isOpen
      iconSrc={'common/setting'}
      iconColor={'primary.600'}
      title={t('workflow:tool_active_config')}
      onClose={onClose}
    >
      <ModalBody pt={6}>
        {inputList.map((item, i) => {
          const inputKey = `value.${item.key}.value`;
          const value = getValues(`value.${item.key}`);
          const showInput = !!value?.value || !value?.secret || editIndex === i;

          return (
            <Box key={item.key} _notLast={{ mb: 5 }}>
              <Flex alignItems={'center'}>
                <FormLabel required={item.required} color={'myGray.600'}>
                  {t(item.label as any)}
                </FormLabel>
                {item.description && <QuestionTip label={item.description} />}
              </Flex>
              {item.inputType === 'string' && (
                <Input
                  bg={'myGray.50'}
                  {...register(inputKey, {
                    required: item.required
                  })}
                />
              )}
              {item.inputType === 'secret' && (
                <Flex alignItems={'center'}>
                  {showInput ? (
                    <Input
                      bg={'myGray.50'}
                      {...register(inputKey, {
                        required: item.required
                      })}
                    />
                  ) : (
                    <>
                      <Flex
                        flex={1}
                        borderRadius={'6px'}
                        border={'0.5px solid'}
                        borderColor={'primary.200'}
                        bg={'primary.50'}
                        h={8}
                        px={3}
                        alignItems={'center'}
                        gap={1}
                        mr={1}
                      >
                        <MyIcon name="checkCircle" w={'16px'} color={'primary.600'} />
                        <Box fontSize={'sm'} fontWeight={'medium'} color={'primary.600'}>
                          {t('common:had_auth_value')}
                        </Box>
                      </Flex>
                      <IconButton name="edit" onClick={() => setEditIndex(i)} />
                    </>
                  )}
                </Flex>
              )}
            </Box>
          );
        })}
      </ModalBody>
      <ModalFooter>
        <Button mr={4} variant={'whiteBase'} onClick={onClose}>
          {t('common:Cancel')}
        </Button>
        <Button variant={'primary'} onClick={handleSubmit(onSubmit)}>
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};
