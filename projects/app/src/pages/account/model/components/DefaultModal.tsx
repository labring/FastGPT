import React, { useMemo, useState } from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { Box, Flex, ModalBody } from '@chakra-ui/react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { ModelProviderList } from '@fastgpt/global/core/ai/provider';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { HUGGING_FACE_ICON } from '@fastgpt/global/common/system/constants';
import { getModelFromList } from '@fastgpt/global/core/ai/model';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getSystemModelList } from '@/web/core/ai/cofig';
import MultipleSelect from '@fastgpt/web/components/common/MySelect/MultipleSelect';

const DefaultModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();

  const { data: systemModelList = [] } = useRequest2(getSystemModelList, {
    manual: false
  });
  const selectorList = useMemo(() => {
    return systemModelList.map((item) => ({
      icon: item.avatar,
      label: item.name,
      value: item.model
    }));
  }, [systemModelList]);

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

  return (
    <MyModal
      isOpen
      title={t('account:add_default_model')}
      iconSrc="common/model"
      iconColor="primary.600"
      onClose={onClose}
    >
      <ModalBody>
        <MultipleSelect<string>
          list={selectorList}
          value={value}
          onSelect={(e) => {
            setValue(e);
          }}
        />
      </ModalBody>
    </MyModal>
  );
};

export default DefaultModal;
