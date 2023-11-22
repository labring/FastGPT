import React, { useMemo, useState } from 'react';
import type { SelectAppItemType } from '@fastgpt/global/core/module/type';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/module/node/type';
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
  Grid,
  Switch
} from '@chakra-ui/react';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import dynamic from 'next/dynamic';
import { onChangeNode, useFlowProviderStore } from '../../FlowProvider';
import Avatar from '@/components/Avatar';
import MySelect from '@/components/Select';
import MySlider from '@/components/Slider';
import MyTooltip from '@/components/MyTooltip';
import TargetHandle from './TargetHandle';
import MyIcon from '@/components/Icon';
import { useTranslation } from 'next-i18next';
import type { AIChatModuleProps } from '@fastgpt/global/core/module/node/type.d';
import { chatModelList } from '@/web/common/system/staticData';
import { formatPrice } from '@fastgpt/global/support/wallet/bill/tools';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';
import type { SelectedDatasetType } from '@fastgpt/global/core/module/api.d';
import { useQuery } from '@tanstack/react-query';
import type { EditFieldModeType, EditFieldType } from '../modules/FieldEditModal';
import { feConfigs } from '@/web/common/system/staticData';

const FieldEditModal = dynamic(() => import('../modules/FieldEditModal'));
const SelectAppModal = dynamic(() => import('../../SelectAppModal'));
const AIChatSettingsModal = dynamic(() => import('../../../AIChatSettingsModal'));
const DatasetSelectModal = dynamic(() => import('../../../DatasetSelectModal'));

export const Label = React.memo(function Label({
  moduleId,
  inputKey,
  editFiledType = 'input',
  ...item
}: FlowNodeInputItemType & {
  moduleId: string;
  inputKey: string;
  editFiledType?: EditFieldModeType;
}) {
  const { t } = useTranslation();
  const { mode } = useFlowProviderStore();
  const {
    required = false,
    description,
    edit,
    label,
    type,
    valueType,
    showTargetInApp,
    showTargetInPlugin
  } = item;
  const [editField, setEditField] = useState<EditFieldType>();

  const targetHandle = useMemo(() => {
    if (type === FlowNodeInputTypeEnum.target) return true;
    if (mode === 'app' && showTargetInApp) return true;
    if (mode === 'plugin' && showTargetInPlugin) return true;
    return false;
  }, [mode, showTargetInApp, showTargetInPlugin, type]);

  return (
    <Flex className="nodrag" cursor={'default'} alignItems={'center'} position={'relative'}>
      <Box position={'relative'}>
        {t(label)}
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

      {targetHandle && <TargetHandle handleKey={inputKey} valueType={valueType} />}

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
                label: item.label,
                type: item.type,
                valueType: item.valueType,
                required: item.required,
                key: inputKey,
                description: item.description
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
        <FieldEditModal
          mode={editFiledType}
          defaultField={editField}
          onClose={() => setEditField(undefined)}
          onSubmit={(e) => {
            const data = {
              ...item,
              ...e
            };
            // same key
            if (editField.key === data.key) {
              onChangeNode({
                moduleId,
                type: 'updateInput',
                key: data.key,
                value: data
              });
            } else {
              // diff key. del and add
              onChangeNode({
                moduleId,
                type: 'replaceInput',
                key: editField.key,
                value: data
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
  CustomComponent = {},
  editFiledType
}: {
  flowInputList: FlowNodeInputItemType[];
  moduleId: string;
  CustomComponent?: Record<string, (e: FlowNodeInputItemType) => React.ReactNode>;
  editFiledType?: EditFieldModeType;
}) => {
  const sortInputs = useMemo(
    () =>
      flowInputList
        .filter((item) => !item.plusField || feConfigs.isPlus)
        .sort((a, b) => (a.key === FlowNodeInputTypeEnum.switch ? -1 : 1)),
    [flowInputList]
  );
  return (
    <>
      {sortInputs.map(
        (item) =>
          item.type !== FlowNodeInputTypeEnum.hidden && (
            <Box key={item.key} _notLast={{ mb: 7 }} position={'relative'}>
              {!!item.label && (
                <Label
                  editFiledType={editFiledType}
                  moduleId={moduleId}
                  inputKey={item.key}
                  {...item}
                />
              )}
              <Box mt={2} className={'nodrag'}>
                {item.type === FlowNodeInputTypeEnum.numberInput && (
                  <NumberInputRender item={item} moduleId={moduleId} />
                )}
                {item.type === FlowNodeInputTypeEnum.input && (
                  <TextInputRender item={item} moduleId={moduleId} />
                )}
                {item.type === FlowNodeInputTypeEnum.switch && (
                  <SwitchRender item={item} moduleId={moduleId} />
                )}
                {item.type === FlowNodeInputTypeEnum.textarea && (
                  <TextareaRender item={item} moduleId={moduleId} />
                )}
                {item.type === FlowNodeInputTypeEnum.select && (
                  <SelectRender item={item} moduleId={moduleId} />
                )}
                {item.type === FlowNodeInputTypeEnum.slider && (
                  <SliderRender item={item} moduleId={moduleId} />
                )}
                {item.type === FlowNodeInputTypeEnum.selectApp && (
                  <SelectAppRender item={item} moduleId={moduleId} />
                )}
                {item.type === FlowNodeInputTypeEnum.aiSettings && (
                  <AISetting inputs={sortInputs} item={item} moduleId={moduleId} />
                )}
                {item.type === FlowNodeInputTypeEnum.selectChatModel && (
                  <SelectChatModelRender inputs={sortInputs} item={item} moduleId={moduleId} />
                )}
                {item.type === FlowNodeInputTypeEnum.selectDataset && (
                  <SelectDatasetRender item={item} moduleId={moduleId} />
                )}
                {item.type === FlowNodeInputTypeEnum.custom && CustomComponent[item.key] && (
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
  inputs?: FlowNodeInputItemType[];
  item: FlowNodeInputItemType;
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
          type: 'updateInput',
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
          type: 'updateInput',
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

var SwitchRender = React.memo(function SwitchRender({ item, moduleId }: RenderProps) {
  return (
    <Switch
      size={'lg'}
      isChecked={item.value}
      onChange={(e) => {
        onChangeNode({
          moduleId,
          type: 'updateInput',
          key: item.key,
          value: {
            ...item,
            value: e.target.checked
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
          type: 'updateInput',
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
          type: 'updateInput',
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
            type: 'updateInput',
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
    return obj as AIChatModuleProps;
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
                type: 'updateInput',
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

var SelectChatModelRender = React.memo(function SelectChatModelRender({
  inputs = [],
  item,
  moduleId
}: RenderProps) {
  const modelList = chatModelList || [];

  function onChangeModel(e: string) {
    {
      onChangeNode({
        moduleId,
        type: 'updateInput',
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
        type: 'updateInput',
        key: 'maxToken',
        value: {
          ...inputs.find((input) => input.key === 'maxToken'),
          markList: [
            { label: '100', value: 100 },
            { label: `${model.maxResponse}`, value: model.maxResponse }
          ],
          max: model.maxResponse,
          value: model.maxResponse / 2
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

  return (
    <MySelect
      minW={'350px'}
      width={'100%'}
      value={item.value}
      list={list}
      onchange={onChangeModel}
    />
  );
});

var SelectDatasetRender = React.memo(function SelectDatasetRender({ item, moduleId }: RenderProps) {
  const theme = useTheme();
  const { mode } = useFlowProviderStore();
  const { allDatasets, loadAllDatasets } = useDatasetStore();
  const {
    isOpen: isOpenKbSelect,
    onOpen: onOpenKbSelect,
    onClose: onCloseKbSelect
  } = useDisclosure();

  const selectedDatasets = useMemo(() => {
    const value = item.value as SelectedDatasetType;
    return allDatasets.filter((dataset) => value?.find((item) => item.datasetId === dataset._id));
  }, [allDatasets, item.value]);

  useQuery(['loadAllDatasets'], loadAllDatasets);

  return (
    <>
      <Grid gridTemplateColumns={'repeat(2, minmax(0, 1fr))'} gridGap={4} minW={'350px'} w={'100%'}>
        <Button h={'36px'} onClick={onOpenKbSelect}>
          选择知识库
        </Button>
        {selectedDatasets.map((item) => (
          <Flex
            key={item._id}
            alignItems={'center'}
            h={'36px'}
            border={theme.borders.base}
            px={2}
            borderRadius={'md'}
          >
            <Avatar src={item.avatar} w={'24px'}></Avatar>
            <Box
              ml={3}
              flex={'1 0 0'}
              w={0}
              className="textEllipsis"
              fontWeight={'bold'}
              fontSize={['md', 'lg', 'xl']}
            >
              {item.name}
            </Box>
          </Flex>
        ))}
      </Grid>
      {isOpenKbSelect && (
        <DatasetSelectModal
          isOpen={isOpenKbSelect}
          defaultSelectedDatasets={item.value}
          onChange={(e) => {
            onChangeNode({
              moduleId,
              key: item.key,
              type: 'updateInput',
              value: {
                ...item,
                value: e
              }
            });
          }}
          onClose={onCloseKbSelect}
        />
      )}
    </>
  );
});

var SelectAppRender = React.memo(function SelectAppRender({ item, moduleId }: RenderProps) {
  const { filterAppIds } = useFlowProviderStore();
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
          filterAppIds={filterAppIds}
          onClose={onCloseSelectApp}
          onSuccess={(e) => {
            onChangeNode({
              moduleId,
              type: 'updateInput',
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
