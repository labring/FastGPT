import React, { useState } from 'react';
import type { FlowInputItemType } from '@/types/core/app/flow';
import {
  Box,
  Textarea,
  Input,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Flex
} from '@chakra-ui/react';
import { FlowInputItemTypeEnum } from '@/constants/flow';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import dynamic from 'next/dynamic';
import MySelect from '@/components/Select';
import MySlider from '@/components/Slider';
import MyTooltip from '@/components/MyTooltip';
import TargetHandle from './TargetHandle';
import MyIcon from '@/components/Icon';
const SetInputFieldModal = dynamic(() => import('../modules/SetInputFieldModal'));
import { useFlowStore } from '../Provider';

export const Label = ({
  moduleId,
  inputKey,
  ...item
}: FlowInputItemType & {
  moduleId: string;
  inputKey: string;
}) => {
  const { required = false, description, edit, label, type, valueType } = item;
  const [editField, setEditField] = useState<FlowInputItemType>();
  const { onChangeNode } = useFlowStore();

  return (
    <Flex className="nodrag" cursor={'default'} alignItems={'center'} position={'relative'}>
      <Box position={'relative'}>
        {label}
        {description && (
          <MyTooltip label={description} forceShow>
            <QuestionOutlineIcon display={['none', 'inline']} ml={1} />
          </MyTooltip>
        )}
        {required && (
          <Box
            position={'absolute'}
            top={'-2px'}
            right={'-8px'}
            color={'red.500'}
            fontWeight={'bold'}
          >
            *
          </Box>
        )}
      </Box>

      {(type === FlowInputItemTypeEnum.target || valueType) && (
        <TargetHandle handleKey={inputKey} valueType={valueType} />
      )}

      {edit && (
        <>
          <MyIcon
            name={'settingLight'}
            w={'14px'}
            cursor={'pointer'}
            ml={3}
            _hover={{ color: 'myBlue.600' }}
            onClick={() =>
              setEditField({
                ...item,
                key: inputKey
              })
            }
          />
          <MyIcon
            className="delete"
            name={'delete'}
            w={'14px'}
            cursor={'pointer'}
            ml={2}
            _hover={{ color: 'red.500' }}
            onClick={() => {
              onChangeNode({
                moduleId,
                type: 'delInput',
                key: inputKey,
                value: ''
              });
            }}
          />
        </>
      )}
      {!!editField && (
        <SetInputFieldModal
          defaultField={editField}
          onClose={() => setEditField(undefined)}
          onSubmit={(data) => {
            // same key
            if (editField.key === data.key) {
              onChangeNode({
                moduleId,
                type: 'inputs',
                key: inputKey,
                value: data
              });
            } else {
              // diff key. del and add
              onChangeNode({
                moduleId,
                type: 'addInput',
                key: data.key,
                value: data
              });
              setTimeout(() => {
                onChangeNode({
                  moduleId,
                  type: 'delInput',
                  key: editField.key,
                  value: ''
                });
              });
            }
            setEditField(undefined);
          }}
        />
      )}
    </Flex>
  );
};

const RenderInput = ({
  flowInputList,
  moduleId,
  CustomComponent = {}
}: {
  flowInputList: FlowInputItemType[];
  moduleId: string;
  CustomComponent?: Record<string, (e: FlowInputItemType) => React.ReactNode>;
}) => {
  const { onChangeNode } = useFlowStore();
  return (
    <>
      {flowInputList.map(
        (item) =>
          item.type !== FlowInputItemTypeEnum.hidden && (
            <Box key={item.key} _notLast={{ mb: 7 }} position={'relative'}>
              {!!item.label && <Label moduleId={moduleId} inputKey={item.key} {...item} />}
              <Box mt={2} className={'nodrag'}>
                {item.type === FlowInputItemTypeEnum.numberInput && (
                  <NumberInput
                    defaultValue={item.value}
                    min={item.min}
                    max={item.max}
                    onChange={(e) => {
                      onChangeNode({
                        moduleId,
                        type: 'inputs',
                        key: item.key,
                        value: {
                          ...item,
                          value: Number(e)
                        }
                      });
                    }}
                  >
                    <NumberInputField />
                    <NumberInputStepper>
                      <NumberIncrementStepper />
                      <NumberDecrementStepper />
                    </NumberInputStepper>
                  </NumberInput>
                )}
                {item.type === FlowInputItemTypeEnum.input && (
                  <Input
                    placeholder={item.placeholder}
                    defaultValue={item.value}
                    onChange={(e) => {
                      onChangeNode({
                        moduleId,
                        type: 'inputs',
                        key: item.key,
                        value: {
                          ...item,
                          value: e.target.value
                        }
                      });
                    }}
                  />
                )}
                {item.type === FlowInputItemTypeEnum.textarea && (
                  <Textarea
                    rows={5}
                    placeholder={item.placeholder}
                    resize={'both'}
                    defaultValue={item.value}
                    onChange={(e) => {
                      onChangeNode({
                        moduleId,
                        type: 'inputs',
                        key: item.key,
                        value: {
                          ...item,
                          value: e.target.value
                        }
                      });
                    }}
                  />
                )}
                {item.type === FlowInputItemTypeEnum.select && (
                  <MySelect
                    width={'100%'}
                    value={item.value}
                    list={item.list || []}
                    onchange={(e) => {
                      onChangeNode({
                        moduleId,
                        type: 'inputs',
                        key: item.key,
                        value: {
                          ...item,
                          value: e
                        }
                      });
                    }}
                  />
                )}
                {item.type === FlowInputItemTypeEnum.slider && (
                  <Box pt={5} pb={4} px={2}>
                    <MySlider
                      markList={item.markList}
                      width={'100%'}
                      min={item.min || 0}
                      max={item.max}
                      step={item.step || 1}
                      value={item.value}
                      onChange={(e) => {
                        onChangeNode({
                          moduleId,
                          type: 'inputs',
                          key: item.key,
                          value: {
                            ...item,
                            value: e
                          }
                        });
                      }}
                    />
                  </Box>
                )}
                {item.type === FlowInputItemTypeEnum.custom && CustomComponent[item.key] && (
                  <>{CustomComponent[item.key]({ ...item })}</>
                )}
              </Box>
            </Box>
          )
      )}
    </>
  );
};

export default React.memo(RenderInput);
