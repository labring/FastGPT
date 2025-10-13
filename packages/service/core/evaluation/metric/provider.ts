import { readConfigData } from '../../../../../projects/app/src/service/common/system';
import { EvalMetricTypeEnum } from '@fastgpt/global/core/evaluation/metric/constants';
import type { EvalMetricSchemaType } from '@fastgpt/global/core/evaluation/metric/type';

export async function loadSystemBuiltinMetrics(): Promise<void> {
  try {
    const metricContent = await readConfigData('metric.json');
    const { builtinMetrics } = JSON.parse(metricContent);

    global.builtinMetrics = (builtinMetrics || []).map((metric: any) => ({
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

    console.log(`Loaded ${global.builtinMetrics.length} builtin metrics`);
  } catch (error) {
    console.error('Failed to load builtin metrics:', error);
    global.builtinMetrics = [];
  }
}

export async function getBuiltinMetrics(): Promise<EvalMetricSchemaType[]> {
  if (!global.builtinMetrics) {
    return [];
  }

  return global.builtinMetrics;
}
