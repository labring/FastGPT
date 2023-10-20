import React, { useMemo, useState } from 'react';
import type { FlowInputItemType, SelectAppItemType } from '@/types/core/app/flow';
import {
  Box,
  Textarea,
  Input,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Flex,
  useDisclosure,
  Button,
  useTheme,
  Grid
} from '@chakra-ui/react';
import { FlowInputItemTypeEnum } from '@/constants/flow';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import dynamic from 'next/dynamic';
import { onChangeNode, useFlowStore } from '../Provider';
import Avatar from '@/components/Avatar';
import MySelect from '@/components/Select';
import MySlider from '@/components/Slider';
import MyTooltip from '@/components/MyTooltip';
import TargetHandle from './TargetHandle';
import MyIcon from '@/components/Icon';
import { useTranslation } from 'react-i18next';
import { AIChatProps } from '@/types/core/aiChat';
import { chatModelList } from '@/web/common/system/staticData';
import { formatPrice } from '@fastgpt/global/common/bill/tools';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';
import { SelectedDatasetType } from '@/types/core/dataset';
import { useQuery } from '@tanstack/react-query';
import { LLMModelItemType } from '@/types/model';

const SetInputFieldModal = dynamic(() => import('../modules/SetInputFieldModal'));
const SelectAppModal = dynamic(() => import('../../../SelectAppModal'));
const AIChatSettingsModal = dynamic(() => import('../../../AIChatSettingsModal'));
const DatasetSelectModal = dynamic(() => import('../../../DatasetSelectModal'));

export const Label = React.memo(function Label({
  moduleId,
  inputKey,
  ...item
}: FlowInputItemType & {
  moduleId: string;
  inputKey: string;
}) {
  const { required = false, description, edit, label, type, valueType } = item;
  const [editField, setEditField] = useState<FlowInputItemType>();

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
});

const RenderInput = ({
  flowInputList,
  moduleId,
  CustomComponent = {}
}: {
  flowInputList: FlowInputItemType[];
  moduleId: string;
  CustomComponent?: Record<string, (e: FlowInputItemType) => React.ReactNode>;
}) => {
  const sortInputs = useMemo(
    () => flowInputList.sort((a, b) => (a.key === FlowInputItemTypeEnum.switch ? -1 : 1)),
    [flowInputList]
  );
  return (
    <>
      {sortInputs.map(
        (item) =>
          item.type !== FlowInputItemTypeEnum.hidden && (
            <Box key={item.key} _notLast={{ mb: 7 }} position={'relative'}>
              {!!item.label && <Label moduleId={moduleId} inputKey={item.key} {...item} />}
              <Box mt={2} className={'nodrag'}>
                {item.type === FlowInputItemTypeEnum.numberInput && (
                  <NumberInputRender item={item} moduleId={moduleId} />
                )}
                {item.type === FlowInputItemTypeEnum.input && (
                  <TextInputRender item={item} moduleId={moduleId} />
                )}
                {item.type === FlowInputItemTypeEnum.textarea && (
                  <TextareaRender item={item} moduleId={moduleId} />
                )}
                {item.type === FlowInputItemTypeEnum.select && (
                  <SelectRender item={item} moduleId={moduleId} />
                )}
                {item.type === FlowInputItemTypeEnum.slider && (
                  <SliderRender item={item} moduleId={moduleId} />
                )}
                {item.type === FlowInputItemTypeEnum.selectApp && (
                  <SelectAppRender item={item} moduleId={moduleId} />
                )}
                {item.type === FlowInputItemTypeEnum.aiSettings && (
                  <AISetting inputs={sortInputs} item={item} moduleId={moduleId} />
                )}
                {item.type === FlowInputItemTypeEnum.maxToken && (
                  <MaxTokenRender inputs={sortInputs} item={item} moduleId={moduleId} />
                )}
                {item.type === FlowInputItemTypeEnum.selectChatModel && (
                  <SelectChatModelRender inputs={sortInputs} item={item} moduleId={moduleId} />
                )}
                {item.type === FlowInputItemTypeEnum.selectDataset && (
                  <SelectDatasetRender item={item} moduleId={moduleId} />
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

type RenderProps = {
  inputs?: FlowInputItemType[];
  item: FlowInputItemType;
  moduleId: string;
};

var NumberInputRender = React.memo(function NumberInputRender({ item, moduleId }: RenderProps) {
  return (
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
  );
});

var TextInputRender = React.memo(function TextInputRender({ item, moduleId }: RenderProps) {
  return (
    <Input
      placeholder={item.placeholder}
      defaultValue={item.value}
      onBlur={(e) => {
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
  );
});

var TextareaRender = React.memo(function TextareaRender({ item, moduleId }: RenderProps) {
  return (
    <Textarea
      rows={5}
      placeholder={item.placeholder}
      resize={'both'}
      defaultValue={item.value}
      onBlur={(e) => {
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
  );
});

var SelectRender = React.memo(function SelectRender({ item, moduleId }: RenderProps) {
  return (
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
  );
});

var SliderRender = React.memo(function SliderRender({ item, moduleId }: RenderProps) {
  return (
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
  );
});

var AISetting = React.memo(function AISetting({ inputs = [], moduleId }: RenderProps) {
  const { t } = useTranslation();
  const chatModulesData = useMemo(() => {
    const obj: Record<string, any> = {};
    inputs.forEach((item) => {
      obj[item.key] = item.value;
    });
    return obj as AIChatProps;
  }, [inputs]);

  const {
    isOpen: isOpenAIChatSetting,
    onOpen: onOpenAIChatSetting,
    onClose: onCloseAIChatSetting
  } = useDisclosure();

  return (
    <>
      <Button
        variant={'base'}
        leftIcon={<MyIcon name={'settingLight'} w={'14px'} />}
        onClick={onOpenAIChatSetting}
      >
        {t('app.AI Settings')}
      </Button>
      {isOpenAIChatSetting && (
        <AIChatSettingsModal
          isAdEdit
          onClose={onCloseAIChatSetting}
          onSuccess={(e) => {
            for (let key in e) {
              const item = inputs.find((input) => input.key === key);
              if (!item) continue;
              onChangeNode({
                moduleId,
                type: 'inputs',
                key,
                value: {
                  ...item,
                  //@ts-ignore
                  value: e[key]
                }
              });
            }
            onCloseAIChatSetting();
          }}
          defaultData={chatModulesData}
        />
      )}
    </>
  );
});

var MaxTokenRender = React.memo(function MaxTokenRender({
  inputs = [],
  item,
  moduleId
}: RenderProps) {
  const model = inputs.find((item) => item.key === 'model')?.value;
  const modelData = chatModelList.find((item) => item.model === model);
  const maxToken = modelData ? modelData.maxToken : 4000;
  const markList = [
    { label: '100', value: 100 },
    { label: `${maxToken}`, value: maxToken }
  ];

  return (
    <Box pt={5} pb={4} px={2}>
      <MySlider
        markList={markList}
        width={'100%'}
        min={item.min || 100}
        max={maxToken}
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
  );
});

var SelectChatModelRender = React.memo(function SelectChatModelRender({
  inputs = [],
  item,
  moduleId
}: RenderProps) {
  const modelList = (item.customData?.() as LLMModelItemType[]) || chatModelList || [];

  function onChangeModel(e: string) {
    {
      onChangeNode({
        moduleId,
        type: 'inputs',
        key: item.key,
        value: {
          ...item,
          value: e
        }
      });

      // update max tokens
      const model = modelList.find((item) => item.model === e) || modelList[0];
      if (!model) return;

      onChangeNode({
        moduleId,
        type: 'inputs',
        key: 'maxToken',
        value: {
          ...inputs.find((input) => input.key === 'maxToken'),
          markList: [
            { label: '100', value: 100 },
            { label: `${model.maxToken}`, value: model.maxToken }
          ],
          max: model.maxToken,
          value: model.maxToken / 2
        }
      });
    }
  }

  const list = modelList.map((item) => {
    const priceStr = `(${formatPrice(item.price, 1000)}元/1k Tokens)`;

    return {
      value: item.model,
      label: `${item.name}${priceStr}`
    };
  });

  if (!item.value && list.length > 0) {
    onChangeModel(list[0].value);
  }

  return <MySelect width={'100%'} value={item.value} list={list} onchange={onChangeModel} />;
});

var SelectDatasetRender = React.memo(function SelectDatasetRender({ item, moduleId }: RenderProps) {
  const theme = useTheme();
  const { allDatasets, loadAllDatasets } = useDatasetStore();
  const {
    isOpen: isOpenKbSelect,
    onOpen: onOpenKbSelect,
    onClose: onCloseKbSelect
  } = useDisclosure();

  const showKbList = useMemo(() => {
    const value = item.value as SelectedDatasetType;
    return allDatasets.filter((dataset) => value.find((kb) => kb.datasetId === dataset._id));
  }, [allDatasets, item.value]);

  useQuery(['loadAllDatasets'], loadAllDatasets);

  return (
    <>
      <Grid gridTemplateColumns={'1fr 1fr'} gridGap={4}>
        <Button h={'36px'} onClick={onOpenKbSelect}>
          选择知识库
        </Button>
        {showKbList.map((item) => (
          <Flex
            key={item._id}
            alignItems={'center'}
            h={'36px'}
            border={theme.borders.base}
            px={2}
            borderRadius={'md'}
          >
            <Avatar src={item.avatar} w={'24px'}></Avatar>
            <Box ml={3} fontWeight={'bold'} fontSize={['md', 'lg', 'xl']}>
              {item.name}
            </Box>
          </Flex>
        ))}
      </Grid>
      <DatasetSelectModal
        isOpen={isOpenKbSelect}
        activeDatasets={item.value}
        onChange={(e) => {
          onChangeNode({
            moduleId,
            key: item.key,
            type: 'inputs',
            value: {
              ...item,
              value: e
            }
          });
        }}
        onClose={onCloseKbSelect}
      />
    </>
  );
});

var SelectAppRender = React.memo(function SelectAppRender({ item, moduleId }: RenderProps) {
  const { appId } = useFlowStore();
  const theme = useTheme();

  const {
    isOpen: isOpenSelectApp,
    onOpen: onOpenSelectApp,
    onClose: onCloseSelectApp
  } = useDisclosure();

  const value = item.value as SelectAppItemType | undefined;

  return (
    <>
      <Box onClick={onOpenSelectApp}>
        {!value ? (
          <Button variant={'base'} w={'100%'}>
            选择应用
          </Button>
        ) : (
          <Flex alignItems={'center'} border={theme.borders.base} borderRadius={'md'} px={3} py={2}>
            <Avatar src={value?.logo} />
            <Box fontWeight={'bold'} ml={1}>
              {value?.name}
            </Box>
          </Flex>
        )}
      </Box>

      {isOpenSelectApp && (
        <SelectAppModal
          defaultApps={item.value?.id ? [item.value.id] : []}
          filterApps={[appId]}
          onClose={onCloseSelectApp}
          onSuccess={(e) => {
            onChangeNode({
              moduleId,
              type: 'inputs',
              key: 'app',
              value: {
                ...item,
                value: e[0]
              }
            });
          }}
        />
      )}
    </>
  );
});
