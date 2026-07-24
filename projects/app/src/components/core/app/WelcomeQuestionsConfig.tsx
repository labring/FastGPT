import React, { useCallback, useMemo } from 'react';
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

/**
 * 编辑对话开场白下方的预设问题列表。
 * 保持问题顺序、空问题和删除行为都由调用方保存，便于系统配置节点和 Agent 表单复用同一交互。
 */
const WelcomeQuestionsConfig = ({
  value = [],
  zoom,
  drawerMode = false,
  onChange
}: WelcomeQuestionsConfigProps) => {
  const { t } = useTranslation();
  const resolvedValue = useMemo(() => (value.length > 0 ? value : ['']), [value]);

  const questionItems = useMemo(
    () =>
      resolvedValue.map((text, index) => ({
        key: `${index}`,
        value: text
      })),
    [resolvedValue]
  );

  const handleChange = useCallback(
    (key: string, text: string) => {
      const updateIndex = Number(key);
      onChange(
        resolvedValue.map((question, questionIndex) =>
          questionIndex === updateIndex ? text : question
        )
      );
    },
    [onChange, resolvedValue]
  );

  const handleDelete = useCallback(
    (key: string) => {
      const deleteIndex = Number(key);
      onChange(resolvedValue.filter((_, questionIndex) => questionIndex !== deleteIndex));
    },
    [onChange, resolvedValue]
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
        onDragEnd={(list) => onChange(list.map((item) => item.value))}
        onChange={handleChange}
        onAdd={() => onChange([...resolvedValue, ''])}
        onDelete={handleDelete}
      />
    </Box>
  );
};

export default React.memo(WelcomeQuestionsConfig);
