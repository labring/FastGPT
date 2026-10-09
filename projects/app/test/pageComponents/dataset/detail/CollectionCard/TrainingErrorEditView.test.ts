import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';

const mocks = vi.hoisted(() => ({ handleSubmit: vi.fn() }));

vi.mock('react-hook-form', () => ({
  useForm: () => ({ register: vi.fn(() => ({})), handleSubmit: mocks.handleSubmit })
}));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@chakra-ui/react', () => ({ Box: 'div', Button: 'button', Flex: 'div' }));
vi.mock('@fastgpt/web/components/common/MyBox/FormLabel', () => ({ default: 'label' }));
vi.mock('@/components/common/Textarea/MyTextarea', () => ({ default: 'textarea' }));
vi.mock('@/components/MyImage', () => ({ default: 'img' }));

vi.stubGlobal('React', React);
const TrainingErrorEditView = (
  await import('@/pageComponents/dataset/detail/CollectionCard/TrainingErrorEditView')
).default;

describe('TrainingErrorEditView answer submission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    { initialAnswer: 'old answer', submittedAnswer: '', expected: { q: 'edited question', a: '' } },
    {
      initialAnswer: 'old answer',
      submittedAnswer: 'edited answer',
      expected: { q: 'edited question', a: 'edited answer' }
    },
    { initialAnswer: '', submittedAnswer: '', expected: { q: 'edited question' } }
  ])(
    'submits only a visible answer field for %j',
    ({ initialAnswer, submittedAnswer, expected }) => {
      const onSave = vi.fn();
      TrainingErrorEditView({
        loading: false,
        editChunk: {
          _id: '507f1f77bcf86cd799439011',
          datasetId: '507f1f77bcf86cd799439012',
          collectionId: '507f1f77bcf86cd799439013',
          mode: TrainingModeEnum.index,
          q: 'question',
          a: initialAnswer
        },
        onCancel: vi.fn(),
        onSave
      });
      const onSubmit = mocks.handleSubmit.mock.calls[0][0];
      onSubmit({ q: 'edited question', a: submittedAnswer });
      expect(onSave).toHaveBeenCalledWith(expected);
    }
  );
});
