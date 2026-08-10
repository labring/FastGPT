import { useState } from 'react';
import { useTranslation } from 'next-i18next';
import DraggableInputList from './DraggableInputList';

type WelcomeQuestionsConfigProps = {
  value?: string[];
  zoom?: number;
  onChange: (value: string[]) => void;
};

/**
 * 编辑对话开场白下方的预设问题列表。
 * 保持为受控组件；空列表不创建输入项，用户点击新增后才写入一个空问题。
 */
function WelcomeQuestionsConfig({ value, zoom, onChange }: WelcomeQuestionsConfigProps) {
  const { t } = useTranslation();
  const questions = value ?? [];
  const [autoFocusKey, setAutoFocusKey] = useState<string>();

  const updateQuestion = (key: string, text: string) => {
    const updateIndex = Number(key);
    onChange(
      questions.map((question, questionIndex) => (questionIndex === updateIndex ? text : question))
    );
  };

  const deleteQuestion = (key: string) => {
    const deleteIndex = Number(key);
    onChange(questions.filter((_, questionIndex) => questionIndex !== deleteIndex));
  };

  const addQuestion = () => {
    const newKey = String(questions.length);
    setAutoFocusKey(newKey);
    onChange([...questions, '']);
  };

  return (
    <DraggableInputList
      items={questions.map((text, index) => ({
        key: String(index),
        value: text
      }))}
      zoom={zoom}
      placeholder={t('workflow:welcome_question_placeholder')}
      addText={t('workflow:add_welcome_question')}
      autoFocusKey={autoFocusKey}
      maxLength={100}
      multiline
      onDragEnd={(items) => onChange(items.map((item) => item.value))}
      onChange={updateQuestion}
      onAdd={addQuestion}
      onDelete={deleteQuestion}
    />
  );
}

export default WelcomeQuestionsConfig;
