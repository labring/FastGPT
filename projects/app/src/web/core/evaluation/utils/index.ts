import { i18nT } from '@fastgpt/web/i18n/utils';

// 内置维度信息映射表
export const BUILTIN_DIMENSION_MAP = {
  answer_correctness: {
    name: i18nT('dashboard_evaluation:builtin_answer_correctness_name'),
    description: i18nT('dashboard_evaluation:builtin_answer_correctness_desc')
  },
  answer_similarity: {
    name: i18nT('dashboard_evaluation:builtin_answer_similarity_name'),
    description: i18nT('dashboard_evaluation:builtin_answer_similarity_desc')
  },
  answer_relevancy: {
    name: i18nT('dashboard_evaluation:builtin_answer_relevancy_name'),
    description: i18nT('dashboard_evaluation:builtin_answer_relevancy_desc')
  },
  faithfulness: {
    name: i18nT('dashboard_evaluation:builtin_faithfulness_name'),
    description: i18nT('dashboard_evaluation:builtin_faithfulness_desc')
  },
  context_recall: {
    name: i18nT('dashboard_evaluation:builtin_context_recall_name'),
    description: i18nT('dashboard_evaluation:builtin_context_recall_desc')
  },
  context_precision: {
    name: i18nT('dashboard_evaluation:builtin_context_precision_name'),
    description: i18nT('dashboard_evaluation:builtin_context_precision_desc')
  }
};

export const getBuiltinDimensionInfo = (dimensionName: string) => {
  return BUILTIN_DIMENSION_MAP[dimensionName as keyof typeof BUILTIN_DIMENSION_MAP] || null;
};

// 获取内置维度的英文信息（用于下发给后台）
export const getBuiltinDimensionEnglishInfo = (dimensionName: string) => {
  const dimensionMap = {
    answer_correctness: {
      name: 'answer_correctness',
      description:
        'Evaluates the factual consistency between the generated answer and the reference answer, evaluating whether it is accurate and error-free.'
    },
    answer_similarity: {
      name: 'answer_similarity',
      description:
        'Evaluates the semantic alignment between the generated answer and the reference answer, determining whether they convey the same core information.'
    },
    answer_relevancy: {
      name: 'answer_relevancy',
      description:
        'Evaluates how well the generated answer aligns with the question, judging whether the response directly addresses the query.'
    },
    faithfulness: {
      name: 'faithfulness',
      description:
        'Evaluates whether the generated answer remains faithful to the provided context, determining whether it contains fabricated or inaccurate content.'
    },
    context_recall: {
      name: 'context_recall',
      description:
        'Evaluates whether the retrieval system successfully retrieves all key information necessary for formulating the answer, assessing the completeness of retrieval.'
    },
    context_precision: {
      name: 'context_precision',
      description:
        'Evaluates whether high-value information is prioritized in the retrieved content, reflecting the quality of ranking and information density.'
    }
  };

  return dimensionMap[dimensionName as keyof typeof dimensionMap] || null;
};

export const BUILTIN_ID_PREFIX = 'builtin_';

// 根据维度ID获取维度名称（去掉前缀）
export const getBuiltinDimensionNameFromId = (dimensionId: string): string => {
  if (dimensionId.startsWith(BUILTIN_ID_PREFIX)) {
    return dimensionId.substring(BUILTIN_ID_PREFIX.length);
  }
  return dimensionId;
};

// 根据维度名称生成维度ID（添加前缀）
export const getBuiltinDimensionIdFromName = (dimensionName: string): string => {
  return `${BUILTIN_ID_PREFIX}${dimensionName}`;
};

// 将0-1的数字转换为百分比格式（保留两位小数）
export const formatScoreToPercentage = (score: number): number => {
  const result = (score * 100).toFixed(2);
  return parseFloat(result);
};
