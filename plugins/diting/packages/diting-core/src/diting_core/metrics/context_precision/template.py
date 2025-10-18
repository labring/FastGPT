#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json
from typing import Any
from diting_core.metrics.context_precision.schema import Verdict, Reason
from diting_core.metrics.utils import Language


class ContextPrecisionTemplate:
    @staticmethod
    def generate_verdict(
        user_input: str,
        expected_output: str,
        context: str,
        language: Language = Language.ENGLISH,
    ) -> str:
        template_zh = f"""给定问题、答案和上下文，验证上下文是否有助于得出给定答案。如果有用则判决为"1"，如果无用则为"0"，以JSON格式输出。

请返回符合以下JSON Schema格式的输出：
{json.dumps(Verdict.model_json_schema(), ensure_ascii=False)}
不要使用单引号，使用双引号并正确转义。

--------示例-----------
示例 1
输入: {{
    "question": "你能告诉我关于阿尔伯特·爱因斯坦的信息吗？",
    "context": "阿尔伯特·爱因斯坦（1879年3月14日-1955年4月18日）是一位德国出生的理论物理学家，被广泛认为是有史以来最伟大、最有影响力的科学家之一。他最著名的贡献是发展了相对论理论，还对量子力学做出了重要贡献。",
    "answer": "阿尔伯特·爱因斯坦，1879年3月14日出生，是一位德国出生的理论物理学家，被广泛认为是有史以来最伟大、最有影响力的科学家之一。"
}}
输出: {{
    "reason": "提供的上下文确实有助于得出给定答案。上下文包含了爱因斯坦的生平和贡献的关键信息，这些都在答案中得到了体现。",
    "verdict": 1
}}

示例 2
输入: {{
    "question": "世界上最高的山峰是什么？",
    "context": "安第斯山脉是世界上最长的大陆山脉，位于南美洲。它横跨七个国家，拥有西半球许多最高的山峰。该山脉以其多样的生态系统而闻名。",
    "answer": "珠穆朗玛峰。"
}}
输出: {{
    "reason": "提供的上下文讨论的是安第斯山脉，虽然令人印象深刻，但不包括珠穆朗玛峰，也与关于世界最高山峰的问题没有直接关系。",
    "verdict": 0
}}
-----------------------------

现在对以下输入执行相同操作
输入: {{
    "question": "{user_input}",
    "context": "{context}",
    "answer": "{expected_output}"
}}
输出: """

        template_en = f"""Given question, answer and context verify if the context was useful in arriving at the given answer. Give verdict as "1" if useful and "0" if not with json output.

Please return the output in a JSON format that complies with the following schema as specified in JSON Schema:
{json.dumps(Verdict.model_json_schema())}
Do not use single quotes in your response but double quotes, properly escaped with a backslash.

--------EXAMPLES-----------
Example 1
Input: {{
    "question": "What can you tell me about Albert Einstein?",
    "context": "Albert Einstein (14 March 1879 – 18 April 1955) was a German-born theoretical physicist, widely held to be one of the greatest and most influential scientists of all time. Best known for developing the theory of relativity, he also made important contributions to quantum mechanics, and was thus a central figure in the revolutionary reshaping of the scientific understanding of nature that modern physics accomplished in the first decades of the twentieth century. His mass–energy equivalence formula E = mc2, which arises from relativity theory, has been called 'the world's most famous equation'. He received the 1921 Nobel Prize in Physics 'for his services to theoretical physics, and especially for his discovery of the law of the photoelectric effect', a pivotal step in the development of quantum theory. His work is also known for its influence on the philosophy of science. In a 1999 poll of 130 leading physicists worldwide by the British journal Physics World, Einstein was ranked the greatest physicist of all time. His intellectual achievements and originality have made Einstein synonymous with genius.",
    "answer": "Albert Einstein, born on 14 March 1879, was a German-born theoretical physicist, widely held to be one of the greatest and most influential scientists of all time. He received the 1921 Nobel Prize in Physics for his services to theoretical physics."
}}
Output: {{
    "reason": "The provided context was indeed useful in arriving at the given answer. The context includes key information about Albert Einstein's life and contributions, which are reflected in the answer.",
    "verdict": 1
}}

Example 2
Input: {{
    "question": "What is the tallest mountain in the world?",
    "context": "The Andes is the longest continental mountain range in the world, located in South America. It stretches across seven countries and features many of the highest peaks in the Western Hemisphere. The range is known for its diverse ecosystems, including the high-altitude Andean Plateau and the Amazon rainforest.",
    "answer": "Mount Everest."
}}
Output: {{
    "reason": "the provided context discusses the Andes mountain range, which, while impressive, does not include Mount Everest or directly relate to the question about the world's tallest mountain.",
    "verdict": 0
}}
-----------------------------

Now perform the same with the following input
input: {{
    "question": "{user_input}",
    "context": "{context}",
    "answer": "{expected_output}"
}}
Output: """

        return template_zh if language == Language.CHINESE else template_en

    @staticmethod
    def generate_reason(
        user_input: str,
        score: float,
        verdicts: list[dict[str, Any]],
        language: Language = Language.ENGLISH,
    ):
        template_zh = f"""给定输入、判决列表和上下文精确度评分，提供简洁的总结。解释评估结果，但不要在原因中包含数字分数。

判决列表是包含两个键的JSON列表：`verdict`和`reason`（判决原因）。`verdict`为1或0，表示检索上下文中对应的内容片段是否与输入相关（1表示相关，0表示不相关）。
上下文精确度衡量相关内容片段是否排在不相关内容片段之前。注意判决列表是按检索结果的原始排名顺序给出的。

请返回符合以下JSON Schema格式的输出：
{json.dumps(Reason.model_json_schema(), ensure_ascii=False)}
不要使用单引号，使用双引号并正确转义。

示例JSON：
{{
    "reason": "<你的原因>"
}}

在原因中，你需要引用具体的`reason`内容，并结合内容片段的排名位置（从1开始，例如第1个内容片段）来解释相关内容片段（verdict=1）的排名是否高于不相关内容片段（verdict=0）。
如果分数为1，保持简短并用积极向上的语调说些正面的话（但不要过度）。
-----------------------------

现在对以下输入执行相同操作
输入: {{
    "input": {user_input},
    "contextual_precision_score": {score},
    "verdicts": {verdicts},
}}
输出: """

        template_en = f"""Given the input, verdict list, and contextual precision score, provide a CONCISE summary. Explain the evaluation result but do NOT include the numeric score in your reason.

The verdict list is a list of JSON with two keys: `verdict` and `reason` (reason for the verdict). `verdict` will be either 1 or 0, which represents whether the corresponding content chunk in the retrieval context is relevant to the input (1 means relevant, 0 means irrelevant).
Contextual precision measures if the relevant content chunks are ranked higher than irrelevant content chunks. Note that the verdict list is given in the original ranking order of retrieval results.

Please return the output in a JSON format that complies with the following schema as specified in JSON Schema:
{json.dumps(Reason.model_json_schema())}
Do not use single quotes in your response but double quotes, properly escaped with a backslash.

Example JSON:
{{
    "reason": "<your_reason>"
}}

In your reason, you need to reference the specific `reason` content and combine it with the ranking position of content chunks (starting from 1, e.g., the 1st content chunk) to explain whether relevant content chunks (verdict=1) are ranked higher than irrelevant content chunks (verdict=0).
If the score is 1, keep it short and say something positive with an upbeat tone (but don't overdo it).
-----------------------------

Now perform the same with the following input
input: {{
    "input": {user_input},
    "contextual_precision_score": {score},
    "verdicts": {verdicts},
}}
Output: """

        return template_zh if language == Language.CHINESE else template_en
