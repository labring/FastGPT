#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from typing import List
import json
from diting_core.metrics.answer_correctness.schema import (
    Verdicts,
    Statements,
    Reason,
    EvaluationStrategySelection,
    LenientCorrectnessResult,
)
from diting_core.metrics.utils import Language


class AnswerCorrectnessTemplate:
    @staticmethod
    def generate_evaluation_strategy_selection(
        user_input: str,
        expected_output: str,
        actual_output: str,
        language: Language = Language.ENGLISH,
    ) -> str:
        template_zh = f"""你是一位专业的策略决策专家，需要为答案正确性评估选择最合适的算法。

你需要选择合适的评估算法。两种算法的完整流程：

**严格算法（陈述分解+F1评分）**：
1. 陈述拆分：分别将标准答案和实际答案拆分为独立陈述
2. 陈述对比：逐一比较两组陈述，判断每个陈述的类型
   - TP（真正例）：实际答案中存在且被标准答案直接支持的陈述
   - FP（假正例）：实际答案中存在但标准答案中没有的陈述
   - FN（假负例）：标准答案中存在但实际答案中缺失的陈述
3. F1计算：F1 = 2×TP/(2×TP+FP+FN)
4. 问题：对于简短但正确的答案，算法会强制拆分陈述，将标准答案中的详细信息误判为缺失内容，导致评分偏低

**宽松算法（整体正确性评分）**：
1. 整体评估：直接评价答案的事实正确性和完整性
2. 评分标准：关注核心信息是否正确，语义相近即可
3. 不拆分陈述，避免对简短答案的过度惩罚

请返回符合以下JSON Schema格式的输出：
{json.dumps(EvaluationStrategySelection.model_json_schema(), ensure_ascii=False)}

--------示例输出--------
{{
  "strategy": "lenient",
  "reason": "答案简短且事实性强，适合用宽松算法直接评估整体正确性。"
}}

分析以下内容并选择算法：
问题：{user_input}
标准答案：{expected_output}
实际答案：{actual_output}

输出: """

        template_en = f"""You are a professional strategy decision expert who needs to select the most appropriate algorithm for answer correctness evaluation.

You need to choose the appropriate evaluation algorithm. Complete workflow of both algorithms:

**Strict Algorithm (Statement Decomposition + F1 Scoring)**:
1. Statement Split: Break both expected and actual answers into independent statements
2. Statement Comparison: Compare statement groups and classify each statement:
   - TP (True Positive): Statements in actual answer that are directly supported by expected answer
   - FP (False Positive): Statements in actual answer not supported by expected answer
   - FN (False Negative): Statements in expected answer but missing in actual answer
3. F1 Calculation: F1 = 2×TP/(2×TP+FP+FN)
4. Issue: For short but correct answers, the algorithm forces statement splitting and misclassifies detailed information from expected answers as missing content, leading to lower scores

**Lenient Algorithm (Holistic Correctness Scoring)**:
1. Holistic Evaluation: Directly assess factual correctness and completeness of answer
2. Scoring Criteria: Focus on core information correctness, semantically similar is acceptable
3. No statement splitting, avoids over-penalization of short answers

Please return output in JSON format complying with the following schema:
{json.dumps(EvaluationStrategySelection.model_json_schema())}

--------Example Output--------
{{
  "strategy": "lenient",
  "reason": "The answer is short and factual, suitable for direct holistic correctness evaluation using lenient algorithm."
}}

Analyze the following content and select algorithm:
Question: {user_input}
Expected Answer: {expected_output}
Actual Answer: {actual_output}

Output: """

        return template_zh if language == Language.CHINESE else template_en

    @staticmethod
    def generate_lenient_correctness_evaluation(
        user_input: str,
        expected_output: str,
        actual_output: str,
        language: Language = Language.ENGLISH,
    ) -> str:
        template_zh = f"""您是一位专业的数据标注员，负责评估模型输出的正确性。您的任务是根据以下评分标准给出评分：

<评分标准>
正确的答案应当：
- 提供准确且完整的信息
- 不包含事实性错误
- 回答问题的所有部分
- 逻辑上保持一致
- 使用精确和准确的术语

在打分时，您应该进行扣分的情况包括：
- 事实性错误或不准确的信息
- 不完整或部分的答案（缺失问题要求的关键信息）
- 具有误导性或模糊不清的陈述
- 错误的术语使用
- 逻辑不一致
- 缺失关键信息
- 回避问题或表示信息不足（当标准答案中有明确信息时）

<特别注意>
如果问题明确询问具体信息，而实际答案表示"未找到信息"、"建议咨询"等回避性表述，但标准答案中包含了所询问的具体信息，则应该大幅扣分，因为这表明信息获取能力不足。
</特别注意>

<指导说明>
- 仔细阅读输入的问题和模型的输出。
- 将输出与参考输出进行对比，以检查事实的准确性和完整性。
- 重点关注输出中所呈现信息的正确性和完整性，而非其风格或冗长程度。
- 特别关注实际答案是否回避了问题中明确询问的信息。
</指导说明>

<提醒>
目标是评估回复的事实正确性和完整性。如果实际答案没有提供问题所要求的具体信息，即使表达谦虚或建议咨询，也应该显著扣分。
</提醒>

问题：{user_input}
标准答案：{expected_output}
实际答案：{actual_output}

请返回符合以下JSON Schema格式的输出：
{json.dumps(LenientCorrectnessResult.model_json_schema(), ensure_ascii=False)}

--------示例输出--------
{{
  "score": 0.8,
  "reason": "答案基本正确，但表达不够精确，使用了不确定的词汇。"
}}

请给出0-1之间的评分，并说明理由。
**重要**：在理由中不要提及具体的数字分数，请用自然语言解释评分原因。"""

        template_en = f"""You are a professional data annotator responsible for evaluating the factual correctness of model outputs. Your task is to give a score according to the following scoring criteria:

<Scoring Criteria>
A correct answer should:
- Provide accurate and complete information.
- Contain no factual errors.
- Address all parts of the question.
- Be logically consistent.
- Use precise and accurate terminology.

Situations that should result in point deductions:
- Factual errors or inaccurate information.
- Incomplete or partial answers (missing key information required by the question).
- Misleading or ambiguous statements.
- Incorrect terminology usage.
- Logical inconsistencies.
- Missing key information.
- Evasive responses or claiming insufficient information (when the expected answer contains clear information).

<Special Attention>
If a question explicitly asks for specific information, but the actual answer provides evasive responses like "information not found" or "please consult", while the expected answer contains the requested specific information, significant points should be deducted as this indicates insufficient information retrieval capability.
</Special Attention>

<Guidance>
- Carefully read the input question and the model output.
- Compare the output against the expected answer to check accuracy and completeness.
- Focus on the factual correctness and completeness of the information presented, not on style or verbosity.
- Pay special attention to whether the actual answer evades the specific information explicitly asked in the question.
</Guidance>

<Reminder>
The goal is to evaluate the factual accuracy and completeness of the response. If the actual answer fails to provide the specific information required by the question, even if expressed humbly or with suggestions to consult elsewhere, significant points should be deducted.
</Reminder>

Question: {user_input}
Expected Answer: {expected_output}
Actual Answer: {actual_output}

Please return the output in JSON format complying with the following schema:
{json.dumps(LenientCorrectnessResult.model_json_schema())}

--------Example Output--------
{{
  "score": 0.8,
  "reason": "The answer is mostly correct but lacks precision in expression, using uncertain language."
}}

Please provide a score between 0-1 and explain your reasoning.
**IMPORTANT**: Do not mention specific numeric scores in your reasoning. Use natural language to explain the evaluation rationale."""

        return template_zh if language == Language.CHINESE else template_en

    @staticmethod
    def generate_statements(
        user_input: str, text: str, language: Language = Language.ENGLISH
    ) -> str:
        template_zh = f"""给定一个问题和答案，分析答案中每个句子的复杂性。将每个句子分解为一个或多个完全可理解的陈述。确保在任何陈述中都不使用代词。以JSON格式输出。

请返回符合以下JSON Schema格式的输出：
{json.dumps(Statements.model_json_schema(), ensure_ascii=False)}
不要使用单引号，使用双引号并正确转义。

--------示例-----------
示例 1
输入: {{
    "question": "阿尔伯特·爱因斯坦是谁，他最著名的贡献是什么？",
    "answer": "他是一位德国出生的理论物理学家，被广泛认为是有史以来最伟大、最有影响力的物理学家之一。他最著名的贡献是发展了相对论理论，他还对量子力学理论的发展做出了重要贡献。"
}}
输出: {{
    "statements": [
        "阿尔伯特·爱因斯坦是一位德国出生的理论物理学家。",
        "阿尔伯特·爱因斯坦被认为是有史以来最伟大、最有影响力的物理学家之一。",
        "阿尔伯特·爱因斯坦最著名的贡献是发展了相对论理论。",
        "阿尔伯特·爱因斯坦还对量子力学理论的发展做出了重要贡献。"
    ]
}}
-----------------------------

现在对以下输入执行相同操作
输入: {{
    "question": "{user_input}",
    "answer": "{text}"
}}
输出: """

        template_en = f"""Given a question and an answer, analyze the complexity of each sentence in the answer. Break down each sentence into one or more fully understandable statements. Ensure that no pronouns are used in any statement. Format the outputs in JSON.

Please return the output in a JSON format that complies with the following schema as specified in JSON Schema:
{json.dumps(Statements.model_json_schema())}
Do not use single quotes in your response but double quotes, properly escaped with a backslash.

--------EXAMPLES-----------
Example 1
Input: {{
    "question": "Who was Albert Einstein and what is he best known for?",
    "answer": "He was a German-born theoretical physicist, widely acknowledged to be one of the greatest and most influential physicists of all time. He was best known for developing the theory of relativity, he also made important contributions to the development of the theory of quantum mechanics."
}}
Output: {{
    "statements": [
        "Albert Einstein was a German-born theoretical physicist.",
        "Albert Einstein is recognized as one of the greatest and most influential physicists of all time.",
        "Albert Einstein was best known for developing the theory of relativity.",
        "Albert Einstein also made important contributions to the development of the theory of quantum mechanics."
    ]
}}
-----------------------------

Now perform the same with the following input
input: {{
    "question": "{user_input}",
    "answer": "{text}"
}}
Output: """

        return template_zh if language == Language.CHINESE else template_en

    @staticmethod
    def generate_verdicts(
        user_input: str,
        actual_output_statements: List[str],
        expected_output_statements: list[str],
        language: Language = Language.ENGLISH,
    ) -> str:
        template_zh = f"""给定一个标准答案(expected_answer)和实际答案(answer)的陈述，分析每个陈述并将其分类为以下类别之一：TP（真正例）：实际答案中存在且得到标准答案中一个或多个陈述直接支持的陈述，FP（假正例）：实际答案中存在但标准答案中没有直接支持的陈述，FN（假负例）：标准答案中存在但实际答案中没有的陈述。每个陈述只能属于一个类别。为每个分类提供原因。

请返回符合以下JSON Schema格式的输出：
{json.dumps(Verdicts.model_json_schema(), ensure_ascii=False)}
不要使用单引号，使用双引号并正确转义。

--------示例-----------
示例 1
输入: {{
    "question": "什么是水的沸点？",
    "answer": [
        "水在海平面的沸点是100摄氏度"
    ],
    "expected_answer": [
        "水在海平面的沸点是100摄氏度（212华氏度）。",
        "水的沸点会随海拔高度变化。"
    ]
}}
输出: {{
    "TP": [
        {{
            "statement": "水在海平面的沸点是100摄氏度",
            "reason": "这个陈述得到标准答案的直接支持，标准答案明确指出水在海平面的沸点是100摄氏度。"
        }}
    ],
    "FP": [],
    "FN": [
        {{
            "statement": "水的沸点会随海拔高度变化。",
            "reason": "答案中没有提到这个关于水沸点随海拔变化的重要信息。"
        }}
    ]
}}
-----------------------------

现在对以下输入执行相同操作
输入: {{
    "question": "{user_input}",
    "answer": {actual_output_statements},
    "expected_answer": {expected_output_statements}
}}
输出: """

        template_en = f"""Given an expected answer and actual answer statements, analyze each statement and classify them in one of the following categories: TP (true positive): statements that are present in actual answer that are also directly supported by the one or more statements in expected answer, FP (false positive): statements present in the actual answer but not directly supported by any statement in expected answer, FN (false negative): statements found in the expected answer but not present in actual answer. Each statement can only belong to one of the categories. Provide a reason for each classification.

Please return the output in a JSON format that complies with the following schema as specified in JSON Schema:
{json.dumps(Verdicts.model_json_schema())}
Do not use single quotes in your response but double quotes, properly escaped with a backslash.

--------EXAMPLES-----------
Example 1
Input: {{
    "question": "What is the boiling point of water?",
    "answer": [
        "The boiling point of water is 100 degrees Celsius at sea level"
    ],
    "expected_answer": [
        "The boiling point of water is 100 degrees Celsius (212 degrees Fahrenheit) at sea level.",
        "The boiling point of water can change with altitude."
    ]
}}
Output: {{
    "TP": [
        {{
            "statement": "The boiling point of water is 100 degrees Celsius at sea level",
            "reason": "This statement is directly supported by the expected answer which specifies the boiling point of water as 100 degrees Celsius at sea level."
        }}
    ],
    "FP": [],
    "FN": [
        {{
            "statement": "The boiling point of water can change with altitude.",
            "reason": "This additional information about how the boiling point of water can vary with altitude is not mentioned in the answer."
        }}
    ]
}}
-----------------------------

Now perform the same with the following input
input: {{
    "question": "{user_input}",
    "answer": {actual_output_statements},
    "expected_answer": {expected_output_statements}
}}
Output: """

        return template_zh if language == Language.CHINESE else template_en

    @staticmethod
    def generate_reasons(
        score: float,
        tp_reasons: List[str],
        fp_reasons: List[str],
        fn_reasons: List[str],
        language: Language = Language.ENGLISH,
    ) -> str:
        template_zh = f"""基于答案正确性评分和TP、FP、FN的原因列表：
- **正确包含 (TP)**: 回答中事实准确且有事实依据支持的陈述
- **错误添加 (FP)**: 回答中缺乏事实依据支持的陈述
- **遗漏 (FN)**: 事实依据中存在但回答中缺失的重要事实
这些分类仅用于分析。生成解释时，不要使用"TP"、"FP"、"FN"、"真正例"等技术术语。
**重要**：严禁在原因中包含任何数字分数或百分比。请用通俗易懂的自然语言提供简洁友好的原因。
如果分数为1，请保持简短并用积极鼓励的语调。

请返回符合以下JSON Schema格式的输出：
{json.dumps(Reason.model_json_schema(), ensure_ascii=False)}
不要使用单引号，使用双引号并正确转义。

示例JSON：
{{
    "reason": "<你的原因>"
}}

-----------------------------

现在对以下输入执行相同操作
输入: {{
    "answer_correctness_score": {score},
    "tp_reasons": {tp_reasons},
    "fp_reasons": {fp_reasons},
    "fn_reasons": {fn_reasons},
}}
输出: """

        template_en = f"""Given the answer correctness score, the list of reasons of TP, FP, FN:
- **Correctly Included (TP)**: Statements in the response that are factually accurate and directly supported by the expected answer.
- **Incorrectly Added (FP)**: Statements in the response that are not supported by the expected answer.
- **Missing (FN)**: Important facts present in the expected answer but absent from the response.
These categories are for analysis only. When generating your explanation, do NOT use the terms "TP", "FP", "FN", "true positive",
or any technical evaluation jargon.
**IMPORTANT**: Strictly prohibit including any numeric scores or percentages in your reason. Provide a concise and user-friendly reason using plain, natural language.

IMPORTANT: Provide your reason in the SAME LANGUAGE as the input. If the input is in Chinese, respond in Chinese. If the input is in English, respond in English.

Please return the output in a JSON format that complies with the following schema as specified in JSON Schema:
{json.dumps(Reason.model_json_schema())}
Do not use single quotes in your response but double quotes, properly escaped with a backslash.

Example JSON:
{{
    "reason": "<your_reason>"
}}

If the score is 1, keep it short and say something positive with an upbeat encouraging tone (but don't overdo it).
-----------------------------

Now perform the same with the following input
input: {{
    "answer_correctness_score": {score},
    "tp_reasons": {tp_reasons},
    "fp_reasons": {fp_reasons},
    "fn_reasons": {fn_reasons},
}}
Output: """

        return template_zh if language == Language.CHINESE else template_en
