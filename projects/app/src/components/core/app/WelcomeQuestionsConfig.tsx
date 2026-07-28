import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import DraggableInputList from './DraggableInputList';
import { drawerInputStyle } from './configDrawerStyles';

type WelcomeQuestionsConfigProps = {
  value?: string[];
  zoom?: number;
  drawerMode?: boolean;
  onChange: (value: string[]) => void;
};

const getInitialDraftValue = (value?: string[]) => (value === undefined ? [''] : value);

const normalizeWelcomeQuestions = (value: string[]) =>
  value.map((text) => text.trim()).filter(Boolean);

const isSameStringList = (a?: string[], b?: string[]) =>
  a?.length === b?.length && a?.every((item, index) => item === b?.[index]);

/**
 * 编辑对话开场白下方的预设问题列表。
 * 组件内部保留空输入草稿用于编辑体验，对外只保存非空问题，避免默认空输入进入 chatConfig。
 */
const WelcomeQuestionsConfig = ({
  value,
  zoom,
  drawerMode = false,
  onChange
}: WelcomeQuestionsConfigProps) => {
  const { t } = useTranslation();
  const [draftValue, setDraftValue] = useState<string[]>(() => getInitialDraftValue(value));
  const lastEmittedValueRef = useRef<string[]>();

  useEffect(() => {
    const nextDraftValue = getInitialDraftValue(value);
    const nextSavedValue = normalizeWelcomeQuestions(nextDraftValue);

    if (isSameStringList(lastEmittedValueRef.current, nextSavedValue)) {
      return;
    }

    setDraftValue(nextDraftValue);
  }, [value]);

  const questionItems = useMemo(
    () =>
      draftValue.map((text, index) => ({
        key: `${index}`,
        value: text
      })),
    [draftValue]
  );

  const updateDraftValue = useCallback(
    (nextDraftValue: string[]) => {
      const nextSavedValue = normalizeWelcomeQuestions(nextDraftValue);

      lastEmittedValueRef.current = nextSavedValue;
      setDraftValue(nextDraftValue);
      onChange(nextSavedValue);
    },
    [onChange]
  );

  const handleChange = useCallback(
    (key: string, text: string) => {
      const updateIndex = Number(key);
      updateDraftValue(
        draftValue.map((question, questionIndex) =>
          questionIndex === updateIndex ? text : question
        )
      );
    },
    [draftValue, updateDraftValue]
  );

  const handleDelete = useCallback(
    (key: string) => {
      const deleteIndex = Number(key);
      updateDraftValue(draftValue.filter((_, questionIndex) => questionIndex !== deleteIndex));
    },
    [draftValue, updateDraftValue]
  );

  return (
    <Box w={'100%'}>
      <DraggableInputList
        items={questionItems}
        zoom={zoom}
        placeholder={t('workflow:welcome_question_placeholder')}
        addText={t('workflow:add_welcome_question')}
        maxLength={100}
        multiline
        getInputProps={drawerMode ? () => drawerInputStyle : undefined}
        onDragEnd={(list) => updateDraftValue(list.map((item) => item.value))}
        onChange={handleChange}
        onAdd={() => updateDraftValue([...draftValue, ''])}
        onDelete={handleDelete}
      />
    </Box>
  );
};

export default React.memo(WelcomeQuestionsConfig);
