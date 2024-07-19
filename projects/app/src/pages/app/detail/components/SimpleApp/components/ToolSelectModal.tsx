import React, { useCallback, useEffect, useState } from 'react';

import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import {
  Box,
  Button,
  Flex,
  Input,
  InputGroup,
  InputLeftElement,
  ModalBody,
  ModalFooter,
  NumberDecrementStepper,
  NumberIncrementStepper,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  Switch,
  Textarea
} from '@chakra-ui/react';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { useRequest, useRequest2 } from '@fastgpt/web/hooks/useRequest';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import {
  FlowNodeTemplateType,
  NodeTemplateListItemType
} from '@fastgpt/global/core/workflow/type/node.d';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { AddIcon } from '@chakra-ui/icons';
import {
  getPreviewPluginNode,
  getSystemPlugTemplates,
  getSystemPluginPaths
} from '@/web/core/app/api/plugin';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { useForm } from 'react-hook-form';
import JsonEditor from '@fastgpt/web/components/common/Textarea/JsonEditor';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { getTeamPlugTemplates } from '@/web/core/app/api/plugin';
import { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { getAppFolderPath } from '@/web/core/app/api/app';
import FolderPath from '@/components/common/folder/Path';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import CoseTooltip from '@/components/core/app/plugin/CoseTooltip';
import { useSystemStore } from '@/web/common/system/useSystemStore';

type Props = {
  selectedTools: FlowNodeTemplateType[];
  onAddTool: (tool: FlowNodeTemplateType) => void;
  onRemoveTool: (tool: NodeTemplateListItemType) => void;
};

enum TemplateTypeEnum {
  'systemPlugin' = 'systemPlugin',
  'teamPlugin' = 'teamPlugin'
}

const ToolSelectModal = ({ onClose, ...props }: Props & { onClose: () => void }) => {
  const { t } = useTranslation();

  const [templateType, setTemplateType] = useState(TemplateTypeEnum.teamPlugin);
  const [parentId, setParentId] = useState<ParentIdType>('');
  const [searchKey, setSearchKey] = useState('');

  const { data: templates = [], loading: isLoading } = useRequest2(
    async () => {
      if (templateType === TemplateTypeEnum.systemPlugin) {
        return getSystemPlugTemplates({ parentId, searchKey });
      } else if (templateType === TemplateTypeEnum.teamPlugin) {
        return getTeamPlugTemplates({
          parentId,
          searchKey,
          type: [AppTypeEnum.folder, AppTypeEnum.httpPlugin, AppTypeEnum.plugin]
        });
      }
    },
    {
      manual: false,
      throttleWait: 300,
      refreshDeps: [templateType, searchKey, parentId],
      errorToast: t('common:core.module.templates.Load plugin error')
    }
  );

  const { data: paths = [] } = useRequest2(
    () => {
      if (templateType === TemplateTypeEnum.teamPlugin) return getAppFolderPath(parentId);
      return getSystemPluginPaths(parentId);
    },
    {
      manual: false,
      refreshDeps: [parentId]
    }
  );

  useEffect(() => {
    setParentId('');
  }, [templateType, searchKey]);

  return (
    <MyModal
      isOpen
      title={t('common:core.app.Tool call')}
      iconSrc="core/app/toolCall"
      onClose={onClose}
      maxW={['90vw', '700px']}
      w={'700px'}
      h={['90vh', '80vh']}
    >
      {/* Header: row and search */}
      <Box px={[3, 6]} pt={4} display={'flex'} justifyContent={'space-between'} w={'full'}>
        <FillRowTabs
          list={[
            {
              icon: 'core/modules/teamPlugin',
              label: t('common:core.app.ToolCall.Team'),
              value: TemplateTypeEnum.teamPlugin
            },
            {
              icon: 'core/modules/systemPlugin',
              label: t('common:core.app.ToolCall.System'),
              value: TemplateTypeEnum.systemPlugin
            }
          ]}
          py={'5px'}
          px={'15px'}
          value={templateType}
          onChange={(e) => setTemplateType(e as TemplateTypeEnum)}
        />
        <InputGroup w={300}>
          <InputLeftElement h={'full'} alignItems={'center'} display={'flex'}>
            <MyIcon name={'common/searchLight'} w={'16px'} color={'myGray.500'} ml={3} />
          </InputLeftElement>
          <Input
            bg={'myGray.50'}
            placeholder={t('common:plugin.Search plugin')}
            onChange={(e) => setSearchKey(e.target.value)}
          />
        </InputGroup>
      </Box>
      {/* route components */}
      {!searchKey && parentId && (
        <Flex mt={2} px={[3, 6]}>
          <FolderPath
            paths={paths}
            FirstPathDom={null}
            onClick={() => {
              setParentId(null);
            }}
          />
        </Flex>
      )}
      <MyBox isLoading={isLoading} mt={2} px={[3, 6]} pb={3} flex={'1 0 0'} overflowY={'auto'}>
        <RenderList
          templates={templates}
          isLoadingData={isLoading}
          setParentId={setParentId}
          showCost={templateType === TemplateTypeEnum.systemPlugin}
          {...props}
        />
      </MyBox>
    </MyModal>
  );
};

export default React.memo(ToolSelectModal);

const RenderList = React.memo(function RenderList({
  templates,
  selectedTools,
  isLoadingData,
  onAddTool,
  onRemoveTool,
  setParentId,
  showCost
}: Props & {
  templates: NodeTemplateListItemType[];
  isLoadingData: boolean;
  setParentId: React.Dispatch<React.SetStateAction<ParentIdType>>;
  showCost?: boolean;
}) {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const [configTool, setConfigTool] = useState<FlowNodeTemplateType>();
  const onCloseConfigTool = useCallback(() => setConfigTool(undefined), []);

  const { register, getValues, setValue, handleSubmit, reset } = useForm<Record<string, any>>({});

  const { mutate: onClickAdd, isLoading } = useRequest({
    mutationFn: async (template: FlowNodeTemplateType) => {
      const res = await getPreviewPluginNode({ appId: template.id });

      // All input is tool params
      if (res.inputs.every((input) => input.toolDescription)) {
        onAddTool(res);
      } else {
        reset();
        setConfigTool(res);
      }
    },
    errorToast: t('common:core.module.templates.Load plugin error')
  });

  return templates.length === 0 && !isLoadingData ? (
    <EmptyTip text={t('common:core.app.ToolCall.No plugin')} />
  ) : (
    <MyBox>
      {templates.map((item, i) => {
        const selected = selectedTools.some((tool) => tool.pluginId === item.id);

        return (
          <MyTooltip
            key={item.id}
            placement={'bottom'}
            shouldWrapChildren={false}
            label={
              <Box>
                <Flex alignItems={'center'}>
                  <Avatar
                    src={item.avatar}
                    w={'1.75rem'}
                    objectFit={'contain'}
                    borderRadius={'sm'}
                  />
                  <Box fontWeight={'bold'} ml={2} color={'myGray.900'}>
                    {t(item.name as any)}
                  </Box>
                </Flex>
                <Box mt={2} color={'myGray.500'}>
                  {t(item.intro as any) || t('common:core.workflow.Not intro')}
                </Box>
                {showCost && <CoseTooltip cost={item.currentCost} />}
              </Box>
            }
          >
            <Flex
              alignItems={'center'}
              position={'relative'}
              p={[4, 5]}
              _notLast={{
                borderBottomWidth: '1px',
                borderBottomColor: 'myGray.150'
              }}
              _hover={{
                bg: 'myGray.50'
              }}
            >
              <Avatar src={item.avatar} w={'2rem'} objectFit={'contain'} borderRadius={'md'} />

              <Box ml={3} flex={'1 0 0'} color={'myGray.900'}>
                {t(item.name as any)}
              </Box>
              {item.author !== undefined && (
                <Box fontSize={'xs'} mr={3}>
                  {`by ${item.author || feConfigs.systemTitle}`}
                </Box>
              )}
              {selected ? (
                <Button
                  size={'sm'}
                  variant={'grayDanger'}
                  leftIcon={<MyIcon name={'delete'} w={'14px'} />}
                  onClick={() => onRemoveTool(item)}
                >
                  {t('common:common.Remove')}
                </Button>
              ) : item.isFolder ? (
                <Button size={'sm'} variant={'whiteBase'} onClick={() => setParentId(item.id)}>
                  {t('common:common.Open')}
                </Button>
              ) : (
                <Button
                  size={'sm'}
                  variant={'whiteBase'}
                  leftIcon={<AddIcon fontSize={'10px'} />}
                  isLoading={isLoading}
                  onClick={() => onClickAdd(item)}
                >
                  {t('common:common.Add')}
                </Button>
              )}
            </Flex>
          </MyTooltip>
        );
      })}
      {!!configTool && (
        <MyModal
          isOpen
          title={t('common:core.app.ToolCall.Parameter setting')}
          iconSrc="core/app/toolCall"
          overflow={'auto'}
        >
          <ModalBody>
            {configTool.inputs
              .filter((item) => !item.toolDescription)
              .map((input) => {
                const required = input.required || false;

                return (
                  <Box key={input.key} _notLast={{ mb: 4 }} px={1}>
                    <Flex position={'relative'} mb={1} alignItems={'center'}>
                      {t(input.debugLabel || (input.label as any))}
                      {input.description && <QuestionTip label={input.description} ml={1} />}
                    </Flex>
                    {(() => {
                      if (input.valueType === WorkflowIOValueTypeEnum.string) {
                        return (
                          <Textarea
                            {...register(input.key, {
                              required
                            })}
                            placeholder={t(input.placeholder || ('' as any))}
                            bg={'myGray.50'}
                          />
                        );
                      }
                      if (input.valueType === WorkflowIOValueTypeEnum.number) {
                        return (
                          <NumberInput
                            step={input.step}
                            min={input.min}
                            max={input.max}
                            bg={'myGray.50'}
                          >
                            <NumberInputField
                              {...register(input.key, {
                                required: input.required,
                                min: input.min,
                                max: input.max,
                                valueAsNumber: true
                              })}
                            />
                            <NumberInputStepper>
                              <NumberIncrementStepper />
                              <NumberDecrementStepper />
                            </NumberInputStepper>
                          </NumberInput>
                        );
                      }
                      if (input.valueType === WorkflowIOValueTypeEnum.boolean) {
                        return <Switch {...register(input.key, { required })} />;
                      }
                      return (
                        <JsonEditor
                          bg={'myGray.50'}
                          placeholder={t(input.placeholder || ('' as any))}
                          resize
                          value={getValues(input.key)}
                          onChange={(e) => {
                            setValue(input.key, e);
                          }}
                        />
                      );
                    })()}
                  </Box>
                );
              })}
          </ModalBody>
          <ModalFooter gap={6}>
            <Button onClick={onCloseConfigTool} variant={'whiteBase'}>
              {t('common:common.Cancel')}
            </Button>
            <Button
              variant={'primary'}
              onClick={handleSubmit((data) => {
                onAddTool({
                  ...configTool,
                  inputs: configTool.inputs.map((input) => ({
                    ...input,
                    value: data[input.key] ?? input.value
                  }))
                });
                onCloseConfigTool();
              })}
            >
              {t('common:common.Confirm')}
            </Button>
          </ModalFooter>
        </MyModal>
      )}
    </MyBox>
  );
});
