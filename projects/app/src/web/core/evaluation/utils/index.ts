import { i18nT } from '@fastgpt/web/i18n/utils';

export const getBuiltinDimensionInfo = (dimensionId: string) => {
  const dimensionMap = {
    builtin_answer_correctness: {
      name: i18nT('dashboard_evaluation:builtin_answer_correctness_name'),
      description: i18nT('dashboard_evaluation:builtin_answer_correctness_desc')
    },
    builtin_answer_similarity: {
      name: i18nT('dashboard_evaluation:builtin_answer_similarity_name'),
      description: i18nT('dashboard_evaluation:builtin_answer_similarity_desc')
    },
    builtin_answer_relevancy: {
      name: i18nT('dashboard_evaluation:builtin_answer_relevancy_name'),
      description: i18nT('dashboard_evaluation:builtin_answer_relevancy_desc')
    },
    builtin_faithfulness: {
      name: i18nT('dashboard_evaluation:builtin_faithfulness_name'),
      description: i18nT('dashboard_evaluation:builtin_faithfulness_desc')
    },
    builtin_context_recall: {
      name: i18nT('dashboard_evaluation:builtin_context_recall_name'),
      description: i18nT('dashboard_evaluation:builtin_context_recall_desc')
    },
    builtin_context_precision: {
      name: i18nT('dashboard_evaluation:builtin_context_precision_name'),
      description: i18nT('dashboard_evaluation:builtin_context_precision_desc')
    }
  };

  return dimensionMap[dimensionId as keyof typeof dimensionMap] || null;
};
