import { readConfigData } from '../../../../../projects/app/src/service/common/system';
import { EvalMetricTypeEnum } from '@fastgpt/global/core/evaluation/metric/constants';
import type { EvalMetricSchemaType } from '@fastgpt/global/core/evaluation/metric/type';

let cachedBuiltinMetrics: EvalMetricSchemaType[] | null = null;
let loadingPromise: Promise<EvalMetricSchemaType[]> | null = null;

export async function getBuiltinMetrics(): Promise<EvalMetricSchemaType[]> {
  if (cachedBuiltinMetrics) {
    return cachedBuiltinMetrics;
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = loadBuiltinMetrics();

  try {
    const result = await loadingPromise;
    cachedBuiltinMetrics = result;
    return result;
  } finally {
    loadingPromise = null;
  }
}

async function loadBuiltinMetrics(): Promise<EvalMetricSchemaType[]> {
  const metricContent = await readConfigData('metric.json');
  const { builtinMetrics } = JSON.parse(metricContent);

  return (builtinMetrics || []).map((metric: any) => ({
    _id: `builtin_${metric.name}`,
    teamId: '',
    tmbId: '',
    name: metric.name,
    description: metric.description || '',
    type: EvalMetricTypeEnum.Builtin,
    createTime: new Date(),
    updateTime: new Date(),
    ...Object.fromEntries(
      Object.entries(metric).filter(([key, value]) => key.endsWith('Required') && value === true)
    )
  })) as EvalMetricSchemaType[];
}
