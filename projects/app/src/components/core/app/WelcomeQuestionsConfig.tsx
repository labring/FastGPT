import { useTranslation } from 'next-i18next';
import DraggableInputList from './DraggableInputList';

type WelcomeQuestionsConfigProps = {
  value?: string[];
  zoom?: number;
  onChange: (value: string[]) => void;
};

const emptyQuestionList = [''];

/**
 * 编辑对话开场白下方的预设问题列表。
 * 保持为受控组件；空列表仅派生一个空输入用于编辑，问题过滤由使用端统一处理。
 */
function WelcomeQuestionsConfig({ value, zoom, onChange }: WelcomeQuestionsConfigProps) {
  const { t } = useTranslation();
  const questions = value?.length ? value : emptyQuestionList;

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

  return (
    <DraggableInputList
      items={questions.map((text, index) => ({
        key: String(index),
        value: text
      }))}
      zoom={zoom}
      placeholder={t('workflow:welcome_question_placeholder')}
      addText={t('workflow:add_welcome_question')}
      maxLength={100}
      multiline
      onDragEnd={(items) => onChange(items.map((item) => item.value))}
      onChange={updateQuestion}
      onAdd={() => onChange([...questions, ''])}
      onDelete={deleteQuestion}
    />
  );
}

export default WelcomeQuestionsConfig;
