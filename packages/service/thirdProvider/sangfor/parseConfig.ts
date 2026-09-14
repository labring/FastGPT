import type FormData from 'form-data';
import type {
  DatasetSchemaType,
  IultmzhFileParseConfigType
} from '@fastgpt/global/core/dataset/type';

/**
 * 从 dataset 取 sangfor 文件解析配置,缺失字段用固定默认值补全为完整四个 boolean,
 * 避免不同解析引擎对缺失字段的不同兜底行为。
 */
export const getDatasetIultmzhFileParseConfig = (
  dataset?: Pick<DatasetSchemaType, 'sangforFileParseConfig'> | null
): IultmzhFileParseConfigType => ({
  keep_header_footer: dataset?.sangforFileParseConfig?.keep_header_footer ?? false,
  keep_appendix: dataset?.sangforFileParseConfig?.keep_appendix ?? false,
  image_analysis: dataset?.sangforFileParseConfig?.image_analysis ?? false,
  chart_analysis: dataset?.sangforFileParseConfig?.chart_analysis ?? false
});

// 外部解析服务契约:四个开关逐个以独立表单字段下发,值统一转字符串(服务端自行 str→bool)
export const appendIultmzhFileParseFields = (
  form: FormData,
  config?: IultmzhFileParseConfigType
) => {
  if (!config) return;
  Object.entries(config).forEach(([fieldKey, value]) => {
    if (value !== undefined && value !== null) {
      form.append(fieldKey, String(value));
    }
  });
};
