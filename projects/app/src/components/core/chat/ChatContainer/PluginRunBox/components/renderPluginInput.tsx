import { Box, Button, Flex, Switch, Textarea, useDisclosure } from '@chakra-ui/react';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { type FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MySelect from '@fastgpt/web/components/common/MySelect';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';
import { useFileUpload } from '../../ChatBox/hooks/useFileUpload';
import { useContextSelector } from 'use-context-selector';
import MyIcon from '@fastgpt/web/components/common/Icon';
import FilePreview from '../../components/FilePreview';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useEffect, useMemo } from 'react';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useFieldArray } from 'react-hook-form';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import { isEqual } from 'lodash';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import { PluginRunContext } from '../context';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import AIModelSelector from '@/components/Select/AIModelSelector';

const JsonEditor = dynamic(() => import('@fastgpt/web/components/common/Textarea/JsonEditor'));

const FileSelector = ({
  input,
  setUploading,
  onChange,
  value
}: {
  input: FlowNodeInputItemType;
  setUploading: React.Dispatch<React.SetStateAction<boolean>>;
  onChange: (...event: any[]) => void;
  value: any;
}) => {
  const { t } = useTranslation();

  const variablesForm = useContextSelector(ChatItemContext, (v) => v.variablesForm);
  const histories = useContextSelector(ChatRecordContext, (v) => v.chatRecords);
  const appId = useContextSelector(PluginRunContext, (v) => v.appId);
  const chatId = useContextSelector(PluginRunContext, (v) => v.chatId);
  const outLinkAuthData = useContextSelector(PluginRunContext, (v) => v.outLinkAuthData);

  const fileCtrl = useFieldArray({
    control: variablesForm.control,
    name: `variables.${input.key}`
  });
  const {
    File,
    fileList,
    selectFileIcon,
    uploadFiles,
    onOpenSelectFile,
    onSelectFile,
    removeFiles,
    replaceFiles,
    hasFileUploading
  } = useFileUpload({
    fileSelectConfig: {
      canSelectFile: input.canSelectFile ?? true,
      canSelectImg: input.canSelectImg ?? false,
      maxFiles: input.maxFiles ?? 5
    },
    outLinkAuthData,
    appId,
    chatId,
    fileCtrl: fileCtrl as any
  });

  useEffect(() => {
    if (!Array.isArray(value)) {
      replaceFiles([]);
      return;
    }

    // compare file names and update if different
    const valueFileNames = value.map((item) => item.name);
    const currentFileNames = fileList.map((item) => item.name);
    if (!isEqual(valueFileNames, currentFileNames)) {
      replaceFiles(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const isDisabledInput = histories.length > 0;
  useRequest2(uploadFiles, {
    manual: false,
    errorToast: t('common:upload_file_error'),
    refreshDeps: [fileList]
  });

  useEffect(() => {
    setUploading(hasFileUploading);
    onChange(
      fileList.map((item) => ({
        type: item.type,
        name: item.name,
        url: item.url,
        icon: item.icon
      }))
    );
  }, [fileList, hasFileUploading, onChange, setUploading]);

  return (
    <>
      <Flex alignItems={'center'}>
        <Box position={'relative'}>
          {input.required && (
            <Box position={'absolute'} left={-2} top={'-1px'} color={'red.600'}>
              *
            </Box>
          )}
          <FormLabel fontWeight={'500'}>{t(input.label as any)}</FormLabel>
        </Box>
        {input.description && <QuestionTip ml={2} label={t(input.description as any)} />}
        <Box flex={1} />
        {/* 有历史记录，说明是已经跑过了，不能再新增了 */}
        <Button
          isDisabled={histories.length !== 0}
          leftIcon={<MyIcon name={selectFileIcon as any} w={'16px'} />}
          variant={'whiteBase'}
          onClick={() => {
            onOpenSelectFile();
          }}
        >
          {t('chat:select')}
        </Button>
      </Flex>
      <FilePreview fileList={fileList} removeFiles={isDisabledInput ? undefined : removeFiles} />
      {fileList.length === 0 && <EmptyTip py={0} mt={3} text={t('chat:not_select_file')} />}

      <File onSelect={(files) => onSelectFile({ files })} />
    </>
  );
};

const RenderPluginInput = ({
  value,
  onChange,
  isDisabled,
  isInvalid,
  input,
  setUploading
}: {
  value: any;
  onChange: (...event: any[]) => void;
  isDisabled?: boolean;
  isInvalid: boolean;
  input: FlowNodeInputItemType;
  setUploading: React.Dispatch<React.SetStateAction<boolean>>;
}) => {
  const { t } = useTranslation();
  const inputType = input.renderTypeList[0];
  const { llmModelList } = useSystemStore();

  const render = (() => {
    if (inputType === FlowNodeInputTypeEnum.select && input.list) {
      return (
        <MySelect list={input.list} value={value} onChange={onChange} isDisabled={isDisabled} />
      );
    }
    if (inputType === FlowNodeInputTypeEnum.fileSelect) {
      return (
        <FileSelector onChange={onChange} input={input} setUploading={setUploading} value={value} />
      );
    }
    if (inputType === FlowNodeInputTypeEnum.selectLLMModel) {
      return (
        <AIModelSelector
          w={'100%'}
          value={value}
          list={llmModelList.map((item) => ({
            value: item.model,
            label: item.name
          }))}
          onChange={onChange}
        />
      );
    }
    if (input.valueType === WorkflowIOValueTypeEnum.string) {
      return (
        <Textarea
          value={value}
          onChange={onChange}
          isDisabled={isDisabled}
          placeholder={t(input.placeholder as any)}
          bg={'myGray.50'}
          isInvalid={isInvalid}
        />
      );
    }
    if (input.valueType === WorkflowIOValueTypeEnum.number) {
      return (
        <MyNumberInput
          step={1}
          min={input.min}
          max={input.max}
          isDisabled={isDisabled}
          isInvalid={isInvalid}
          value={value}
          onChange={onChange}
        />
      );
    }
    if (input.valueType === WorkflowIOValueTypeEnum.boolean) {
      return (
        <Switch
          isChecked={value}
          onChange={onChange}
          isDisabled={isDisabled}
          isInvalid={isInvalid}
        />
      );
    }

    return (
      <JsonEditor
        bg={'myGray.50'}
        placeholder={t(input.placeholder as any)}
        resize
        value={value}
        onChange={onChange}
        isInvalid={isInvalid}
      />
    );
  })();

  return (
    <Box _notLast={{ mb: 4 }}>
      {/* label */}
      {inputType !== FlowNodeInputTypeEnum.fileSelect && (
        <Flex alignItems={'center'} mb={1}>
          <Box position={'relative'}>
            {input.required && (
              <Box position={'absolute'} left={-2} top={'-1px'} color={'red.600'}>
                *
              </Box>
            )}
            <FormLabel fontWeight={'500'}>{t(input.label as any)}</FormLabel>
          </Box>
          {input.description && <QuestionTip ml={2} label={t(input.description as any)} />}
          {inputType === FlowNodeInputTypeEnum.customVariable && (
            <Flex
              color={'primary.600'}
              bg={'primary.100'}
              px={2}
              py={1}
              gap={1}
              ml={2}
              fontSize={'mini'}
              rounded={'sm'}
            >
              <MyIcon name={'common/info'} color={'primary.600'} w={4} />
              {t('chat:variable_invisable_in_share')}
            </Flex>
          )}
        </Flex>
      )}

      {render}
    </Box>
  );
};

export default RenderPluginInput;
