import React from 'react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { LLMModelTypeEnum, llmModelTypeFilterMap } from '@fastgpt/global/core/ai/constants';
import { Box, Button, css, useDisclosure } from '@chakra-ui/react';
import type { SettingAIDataType } from '@fastgpt/global/core/app/type.d';
import AISettingModal from '@/components/core/ai/AISettingModal';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { HUGGING_FACE_ICON } from '@fastgpt/global/common/system/constants';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useMount } from 'ahooks';

type Props = {
  llmModelType?: `${LLMModelTypeEnum}`;
  defaultData: SettingAIDataType;
  onChange: (e: SettingAIDataType) => void;
  bg?: string;
};

const SettingLLMModel = ({
  llmModelType = LLMModelTypeEnum.all,
  defaultData,
  onChange,
  bg = 'white'
}: Props) => {
  const { t } = useTranslation();
  const { llmModelList } = useSystemStore();

  const model = defaultData.model;

  const modelList = llmModelList.filter((model) => {
    if (!llmModelType) return true;
    const filterField = llmModelTypeFilterMap[llmModelType];
    if (!filterField) return true;
    //@ts-ignore
    return !!model[filterField];
  });

  const selectedModel = modelList.find((item) => item.model === model) || modelList[0];

  const {
    isOpen: isOpenAIChatSetting,
    onOpen: onOpenAIChatSetting,
    onClose: onCloseAIChatSetting
  } = useDisclosure();

  // Set default model
  useMount(() => {
    if (!model && modelList.length > 0) {
      onChange({
        ...defaultData,
        model: modelList[0].model
      });
    }
  });

  return (
    <Box
      css={css({
        span: {
          display: 'block'
        }
      })}
      position={'relative'}
    >
      <MyTooltip label={t('common:core.app.Setting ai property')}>
        <Button
          w={'100%'}
          justifyContent={'flex-start'}
          variant={'whitePrimaryOutline'}
          size={'lg'}
          fontSize={'sm'}
          bg={bg}
          _active={{
            transform: 'none'
          }}
          leftIcon={
            <Avatar
              borderRadius={'0'}
              src={selectedModel?.avatar || HUGGING_FACE_ICON}
              fallbackSrc={HUGGING_FACE_ICON}
              w={'18px'}
            />
          }
          rightIcon={<MyIcon name={'common/select'} w={'1.2rem'} color={'myGray.500'} />}
          px={3}
          pr={2}
          onClick={onOpenAIChatSetting}
        >
          <Box flex={1} textAlign={'left'}>
            {selectedModel?.name}
          </Box>
        </Button>
      </MyTooltip>
      {isOpenAIChatSetting && (
        <AISettingModal
          onClose={onCloseAIChatSetting}
          onSuccess={(e) => {
            onChange(e);
            onCloseAIChatSetting();
          }}
          defaultData={defaultData}
          llmModels={modelList}
        />
      )}
    </Box>
  );
};

export default React.memo(SettingLLMModel);
