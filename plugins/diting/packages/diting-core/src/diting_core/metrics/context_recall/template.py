#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from typing import List
import json
from diting_core.metrics.context_recall.schema import Verdicts, Reason
from diting_core.metrics.utils import Language


class ContextRecallTemplate:
    @staticmethod
    def generate_verdicts(
        user_input: str,
        expected_output: str,
        retrieval_context: List[str],
        language: Language = Language.ENGLISH,
    ) -> str:
        template_zh = f"""给定上下文和答案，分析答案中的每个句子，并分类该句子是否可以归因于给定的上下文。使用"是"（1）或"否"（0）进行二元分类。以JSON格式输出，包含原因。

请返回符合以下JSON Schema格式的输出：
{json.dumps(Verdicts.model_json_schema(), ensure_ascii=False)}
不要使用单引号，使用双引号并正确转义。

--------示例-----------
示例 1
输入: {{
    "question": "你能告诉我关于阿尔伯特·爱因斯坦的信息吗？",
    "context": "阿尔伯特·爱因斯坦（1879年3月14日 - 1955年4月18日）是一位德国出生的理论物理学家，被广泛认为是有史以来最伟大、最有影响力的科学家之一。他最著名的是发展了相对论理论，他还对量子力学做出了重要贡献，因此是二十世纪前几十年现代物理学在科学理解自然方面的革命性重塑的核心人物。他的质能等价公式E = mc2来源于相对论理论，被称为'世界上最著名的方程'。他因'对理论物理的贡献，特别是发现光电效应定律'而获得1921年诺贝尔物理学奖，这是量子理论发展的关键一步。他的工作还以对科学哲学的影响而闻名。在1999年英国《物理世界》杂志对全球130位顶尖物理学家进行的民意调查中，爱因斯坦被评为有史以来最伟大的物理学家。他的智力成就和原创性使爱因斯坦成为天才的代名词。",
    "answer": "阿尔伯特·爱因斯坦出生于1879年3月14日，是一位德国出生的理论物理学家，被广泛认为是有史以来最伟大、最有影响力的科学家之一。他因对理论物理的贡献而获得1921年诺贝尔物理学奖。他在1905年发表了4篇论文。爱因斯坦于1895年移居瑞士"
}}
输出: {{
    "verdicts": [
        {{
            "statement": "阿尔伯特·爱因斯坦出生于1879年3月14日，是一位德国出生的理论物理学家，被广泛认为是有史以来最伟大、最有影响力的科学家之一。",
            "reason": "上下文中明确提到了爱因斯坦的出生日期。",
            "attributed": 1
        }},
        {{
            "statement": "他因对理论物理的贡献而获得1921年诺贝尔物理学奖。",
            "reason": "这个确切的句子在给定的上下文中存在。",
            "attributed": 1
        }},
        {{
            "statement": "他在1905年发表了4篇论文。",
            "reason": "在给定的上下文中没有提到他写论文的相关信息。",
            "attributed": 0
        }},
        {{
            "statement": "爱因斯坦于1895年移居瑞士。",
            "reason": "在给定的上下文中没有支持这一点的证据。",
            "attributed": 0
        }}
    ]
}}
-----------------------------

现在对以下输入执行相同操作
输入: {{
    "question": {user_input},
    "context": {retrieval_context},
    "answer": {expected_output}
}}
输出: """

        template_en = f"""Given a context, and an answer, analyze each sentence in the answer and classify if the sentence can be attributed to the given context or not. Use only "Yes" (1) or "No" (0) as a binary classification. Output json with reason.

Please return the output in a JSON format that complies with the following schema as specified in JSON Schema:
{json.dumps(Verdicts.model_json_schema())}
Do not use single quotes in your response but double quotes, properly escaped with a backslash.

--------EXAMPLES-----------
Example 1
Input: {{
    "question": "What can you tell me about albert Albert Einstein?",
    "context": "Albert Einstein (14 March 1879 - 18 April 1955) was a German-born theoretical physicist, widely held to be one of the greatest and most influential scientists of all time. Best known for developing the theory of relativity, he also made important contributions to quantum mechanics, and was thus a central figure in the revolutionary reshaping of the scientific understanding of nature that modern physics accomplished in the first decades of the twentieth century. His mass-energy equivalence formula E = mc2, which arises from relativity theory, has been called 'the world's most famous equation'. He received the 1921 Nobel Prize in Physics 'for his services to theoretical physics, and especially for his discovery of the law of the photoelectric effect', a pivotal step in the development of quantum theory. His work is also known for its influence on the philosophy of science. In a 1999 poll of 130 leading physicists worldwide by the British journal Physics World, Einstein was ranked the greatest physicist of all time. His intellectual achievements and originality have made Einstein synonymous with genius.",
    "answer": "Albert Einstein born in 14 March 1879 was  German-born theoretical physicist, widely held to be one of the greatest and most influential scientists of all time. He received the 1921 Nobel Prize in Physics for his services to theoretical physics. He published 4 papers in 1905.  Einstein moved to Switzerland in 1895"
}}
Output: {{
    "verdicts": [
        {{
            "statement": "Albert Einstein, born on 14 March 1879, was a German-born theoretical physicist, widely held to be one of the greatest and most influential scientists of all time.",
            "reason": "The date of birth of Einstein is mentioned clearly in the context.",
            "attributed": 1
        }},
        {{
            "statement": "He received the 1921 Nobel Prize in Physics for his services to theoretical physics.",
            "reason": "The exact sentence is present in the given context.",
            "attributed": 1
        }},
        {{
            "statement": "He published 4 papers in 1905.",
            "reason": "There is no mention about papers he wrote in the given context.",
            "attributed": 0
        }},
        {{
            "statement": "Einstein moved to Switzerland in 1895.",
            "reason": "There is no supporting evidence for this in the given context.",
            "attributed": 0
        }}
    ]
}}
-----------------------------

Now perform the same with the following input
input: {{
    "question": {user_input},
    "context": {retrieval_context},
    "answer": {expected_output}
}}
Output: """

        return template_zh if language == Language.CHINESE else template_en

    @staticmethod
    def generate_reason(
        expected_output: str,
        supportive_reasons: list[str],
        unsupportive_reasons: list[str],
        score: float,
        language: Language = Language.ENGLISH,
    ):
        template_zh = f"""基于原始预期输出、支持性原因列表、不支持性原因列表（通过对比预期输出与检索上下文得出）以及上下文召回评分（分数越接近1表示效果越好），请总结一个简洁的原因说明。注意：不要在原因中包含具体的数字分数。

请将支持性/不支持性原因与预期输出中的相应句子关联起来，并在最终原因中说明这些句子能否在检索上下文中找到支撑依据。

请返回符合以下JSON Schema格式的输出：
{json.dumps(Reason.model_json_schema(), ensure_ascii=False)}
注意：使用双引号而非单引号，并正确转义特殊字符。

示例JSON格式：
{{
    "reason": "<你的原因说明>"
}}

重要提示：
- 在原因说明中不要直接提及"支持性原因"和"不支持性原因"这些术语，它们仅用于帮助你理解评估的整体情况。
- 如果评分为1（满分），请保持简洁并使用积极正面的语调（但不要过于夸张）。
-----------------------------

现在对以下输入执行相同操作
输入: {{
    "contextual_recall_score": {score},
    "expected_output": {expected_output},
    "supportive_reasons": {supportive_reasons},
    "unsupportive_reasons": {unsupportive_reasons},
}}
输出: """

        template_en = f"""Given the original expected output, a list of supportive reasons, and a list of unsupportive reasons (which are derived from comparing the expected output with the retrieval context), and a contextual recall score (closer to 1 the better), summarize a CONCISE reason. Do NOT include the numeric score in your reason.

Relate supportive/unsupportive reasons to the sentence number in expected output, and explain whether these sentences can find supporting evidence in the retrieval context.

Please return the output in a JSON format that complies with the following schema as specified in JSON Schema:
{json.dumps(Reason.model_json_schema())}
Do not use single quotes in your response but double quotes, properly escaped with a backslash.

Example JSON:
{{
    "reason": "<your_reason>"
}}

DO NOT mention 'supportive reasons' and 'unsupportive reasons' in your reason, these terms are just here for you to understand the broader scope of things.
If the score is 1, keep it short and say something positive with an upbeat encouraging tone (but don't overdo it).
-----------------------------

Now perform the same with the following input
input: {{
    "contextual_recall_score": {score},
    "expected_output": {expected_output},
    "supportive_reasons": {supportive_reasons},
    "unsupportive_reasons": {unsupportive_reasons},
}}
Output: """

        return template_zh if language == Language.CHINESE else template_en


if __name__ == "__main__":
    context_recall = ContextRecallTemplate()
    print(
        context_recall.generate_verdicts(
            user_input="你好", expected_output="你好", retrieval_context=["你好"]
        )
    )
