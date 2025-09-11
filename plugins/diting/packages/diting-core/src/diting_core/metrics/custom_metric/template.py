#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json
from diting_core.metrics.custom_metric.schema import CustomMetricVerdict


class CustomMetricTemplate:
    @staticmethod
    def generate_verdict(
        prompt: str, user_input: str, actual_output: str, expected_output: str
    ) -> str:
        schema = CustomMetricVerdict.model_json_schema()
        schema_constraint = json.dumps(schema, ensure_ascii=False, indent=2)

        eval_case = f"""
<输入>
    用户问题： {user_input}
    模型回答：{actual_output}
    参考答案：{expected_output}
</输入>
"""
        # 示例JSON输出
        example_output = {
            "score": 0.3,
            "reason": "输出提供了一个价格标准，但没有涉及台式电脑的具体配置细节，如处理器、内存、存储等信息。此外，价格标准本身可能因地区和市场变化而有所不同，因此缺乏准确性和完整性。输出未能满足评分标准中关于提供准确和完整信息的要求。",
        }
        example_json = json.dumps(example_output, ensure_ascii=False, indent=2)

        json_constraint = f"""
Please return the output in a JSON format that complies with the following schema as specified in JSON Schema:
{schema_constraint}
Do not use single quotes in your response but double quotes, properly escaped with a backslash.

--------Example JSON--------:
{example_json}
"""
        return prompt + eval_case + json_constraint
