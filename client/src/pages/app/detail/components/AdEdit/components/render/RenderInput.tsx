import React from 'react';
import type { FlowInputItemType, FlowModuleItemType } from '@/types/flow';
import {
  Box,
  Textarea,
  Input,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper
} from '@chakra-ui/react';
import { FlowInputItemTypeEnum } from '@/constants/flow';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import MySelect from '@/components/Select';
import MySlider from '@/components/Slider';
import MyTooltip from '@/components/MyTooltip';
import TargetHandle from './TargetHandle';

export const Label = ({
  required = false,
  children,
  description
}: {
  required?: boolean;
  children: React.ReactNode | string;
  description?: string;
}) => (
  <Box as={'label'} display={'inline-block'} position={'relative'}>
    {children}
    {required && (
      <Box position={'absolute'} top={'-2px'} right={'-10px'} color={'red.500'} fontWeight={'bold'}>
        *
      </Box>
    )}
    {description && (
      <MyTooltip label={description} forceShow>
        <QuestionOutlineIcon display={['none', 'inline']} transform={'translateY(-1px)'} ml={1} />
      </MyTooltip>
    )}
  </Box>
);

const RenderBody = ({
  flowInputList,
  moduleId,
  CustomComponent = {},
  onChangeNode
}: {
  flowInputList: FlowInputItemType[];
  moduleId: string;
  CustomComponent?: Record<string, (e: FlowInputItemType) => React.ReactNode>;
  onChangeNode: FlowModuleItemType['onChangeNode'];
}) => {
  return (
    <>
      {flowInputList.map(
        (item) =>
          item.type !== FlowInputItemTypeEnum.hidden && (
            <Box key={item.key} _notLast={{ mb: 7 }} position={'relative'}>
              {!!item.label && (
                <Label required={item.required} description={item.description}>
                  {item.label}

                  {(item.type === FlowInputItemTypeEnum.target || item.valueType) && (
                    <TargetHandle handleKey={item.key} valueType={item.valueType} />
                  )}
                </Label>
              )}
              <Box mt={2} className={'nodrag'}>
                {item.type === FlowInputItemTypeEnum.numberInput && (
                  <NumberInput
                    defaultValue={item.value}
                    min={item.min}
                    max={item.max}
                    onChange={(e) => {
                      onChangeNode({
                        moduleId,
                        key: item.key,
                        value: Number(e)
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
                        key: item.key,
                        value: e.target.value
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
                        key: item.key,
                        value: e.target.value
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
                        key: item.key,
                        value: e
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
                          key: item.key,
                          value: e
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

export default React.memo(RenderBody);
