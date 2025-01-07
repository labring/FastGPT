import React, { useMemo, useState } from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { Box, Flex, ModalBody } from '@chakra-ui/react';
import { MultipleRowArraySelect } from '@fastgpt/web/components/common/MySelect/MultipleRowSelect';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { ModelProviderList } from '@fastgpt/global/core/ai/provider';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { HUGGING_FACE_ICON } from '@fastgpt/global/common/system/constants';
import { getModelFromList } from '@fastgpt/global/core/ai/model';

const DefaultModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const { llmModelList, vectorModelList, whisperModel, audioSpeechModelList, reRankModelList } =
    useSystemStore();
  const [value, setValue] = useState<string[]>([]);

  const modelList = useMemo(() => {
    return [
      ...llmModelList,
      ...vectorModelList,
      ...audioSpeechModelList,
      ...reRankModelList,
      whisperModel
    ].map((item) => ({
      provider: item.provider,
      name: item.name,
      model: item.model
    }));
  }, [llmModelList, vectorModelList, whisperModel, audioSpeechModelList, reRankModelList]);

  const selectorList = useMemo(() => {
    const renderList = ModelProviderList.map<{
      label: React.JSX.Element;
      value: string;
      children: { label: string | React.ReactNode; value: string }[];
    }>((provider) => ({
      label: (
        <Flex alignItems={'center'} py={1}>
          <Avatar
            borderRadius={'0'}
            mr={2}
            src={provider?.avatar || HUGGING_FACE_ICON}
            fallbackSrc={HUGGING_FACE_ICON}
            w={'1rem'}
          />
          <Box>{t(provider.name as any)}</Box>
        </Flex>
      ),
      value: provider.id,
      children: []
    }));

    for (const item of modelList) {
      const modelData = getModelFromList(modelList, item.model);
      const provider =
        renderList.find((item) => item.value === (modelData?.provider || 'Other')) ??
        renderList[renderList.length - 1];

      provider.children.push({
        label: modelData.name,
        value: modelData.model
      });
    }

    return renderList.filter((item) => item.children.length > 0);
  }, [modelList, t]);

  console.log(selectorList);

  return (
    <MyModal
      isOpen
      title={t('account:add_default_model')}
      iconSrc="common/model"
      iconColor="primary.600"
      onClose={onClose}
    >
      <ModalBody>11</ModalBody>
    </MyModal>
  );
};

export default DefaultModal;
