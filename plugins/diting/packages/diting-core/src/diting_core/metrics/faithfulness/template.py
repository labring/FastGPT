#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from typing import List, Any
import json
from diting_core.metrics.faithfulness.schema import Statements, Verdicts, Reason
from diting_core.metrics.utils import Language


class FaithfulnessTemplate:
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
        retrieval_context: str,
        statements: List[str],
        language: Language = Language.ENGLISH,
    ) -> str:
        template_zh = f"""你的任务是基于给定的上下文判断一系列陈述的忠实性。对于每个陈述，如果陈述可以基于上下文直接推断出来，则返回判决1，如果陈述不能基于上下文直接推断出来，则返回判决0。

请返回符合以下JSON Schema格式的输出：
{json.dumps(Verdicts.model_json_schema(), ensure_ascii=False)}
不要使用单引号，使用双引号并正确转义。

--------示例-----------
示例 1
输入: {{
    "context": "约翰是XYZ大学的学生。他正在攻读计算机科学学位。这学期他选了几门课程，包括数据结构、算法和数据库管理。约翰是一个勤奋的学生，花大量时间学习和完成作业。他经常在图书馆待到很晚来完成项目。",
    "statements": [
        "约翰主修生物学。",
        "约翰正在学习人工智能课程。",
        "约翰是一个专注的学生。",
        "约翰有兼职工作。"
    ]
}}
输出: {{
    "verdicts": [
        {{
            "statement": "约翰主修生物学。",
            "reason": "约翰的专业明确提到是计算机科学。没有信息表明他主修生物学。",
            "verdict": 0
        }},
        {{
            "statement": "约翰正在学习人工智能课程。",
            "reason": "上下文中提到了约翰目前选修的课程，但没有提到人工智能。因此，不能推断约翰正在学习AI课程。",
            "verdict": 0
        }},
        {{
            "statement": "约翰是一个专注的学生。",
            "reason": "上下文说明他花大量时间学习和完成作业。此外，还提到他经常在图书馆待到很晚来完成项目，这表明了专注。",
            "verdict": 1
        }},
        {{
            "statement": "约翰有兼职工作。",
            "reason": "上下文中没有提供关于约翰有兼职工作的信息。",
            "verdict": 0
        }}
    ]
}}

示例 2
输入: {{
    "context": "光合作用是植物、藻类和某些细菌用来将光能转化为化学能的过程。",
    "statements": [
        "阿尔伯特·爱因斯坦是天才。"
    ]
}}
输出: {{
    "verdicts": [
        {{
            "statement": "阿尔伯特·爱因斯坦是天才。",
            "reason": "上下文和陈述无关",
            "verdict": 0
        }}
    ]
}}
-----------------------------

现在对以下输入执行相同操作
输入: {{
    "context": {retrieval_context},
    "statements": {statements}
}}
输出: """

        template_en = f"""Your task is to judge the faithfulness of a series of statements based on a given context. For each statement you must return verdict as 1 if the statement can be directly inferred based on the context or 0 if the statement can not be directly inferred based on the context.

Please return the output in a JSON format that complies with the following schema as specified in JSON Schema:
{json.dumps(Verdicts.model_json_schema())}
Do not use single quotes in your response but double quotes,properly escaped with a backslash.

--------EXAMPLES-----------
Example 1
Input: {{
    "context": "John is a student at XYZ University. He is pursuing a degree in Computer Science. He is enrolled in several courses this semester, including Data Structures, Algorithms, and Database Management. John is a diligent student and spends a significant amount of time studying and completing assignments. He often stays late in the library to work on his projects.",
    "statements": [
        "John is majoring in Biology.",
        "John is taking a course on Artificial Intelligence.",
        "John is a dedicated student.",
        "John has a part-time job."
    ]
}}
Output: {{
    "verdicts": [
        {{
            "statement": "John is majoring in Biology.",
            "reason": "John's major is explicitly mentioned as Computer Science. There is no information suggesting he is majoring in Biology.",
            "verdict": 0
        }},
        {{
            "statement": "John is taking a course on Artificial Intelligence.",
            "reason": "The context mentions the courses John is currently enrolled in, and Artificial Intelligence is not mentioned. Therefore, it cannot be deduced that John is taking a course on AI.",
            "verdict": 0
        }},
        {{
            "statement": "John is a dedicated student.",
            "reason": "The context states that he spends a significant amount of time studying and completing assignments. Additionally, it mentions that he often stays late in the library to work on his projects, which implies dedication.",
            "verdict": 1
        }},
        {{
            "statement": "John has a part-time job.",
            "reason": "There is no information given in the context about John having a part-time job.",
            "verdict": 0
        }}
    ]
}}

Example 2
Input: {{
    "context": "Photosynthesis is a process used by plants, algae, and certain bacteria to convert light energy into chemical energy.",
    "statements": [
        "Albert Einstein was a genius."
    ]
}}
Output: {{
    "verdicts": [
        {{
            "statement": "Albert Einstein was a genius.",
            "reason": "The context and statement are unrelated",
            "verdict": 0
        }}
    ]
}}
-----------------------------

Now perform the same with the following input
input: {{
    "context": {retrieval_context},
    "statements": {statements}
}}
Output: """

        return template_zh if language == Language.CHINESE else template_en

    @staticmethod
    def generate_reason(
        score: float, verdicts: List[Any], language: Language = Language.ENGLISH
    ):
        template_zh = f"""给定忠实度得分和判决列表，请简洁地总结评估结果。不要在原因中包含数字分数。

    判决列表包含每个陈述的判决信息，每个判决包含:
    - statement: 原始陈述
    - reason: 判决理由
    - verdict: 判决结果(0表示不一致，1表示一致)

    忠实度得分（0-1分数，表示实际输出对检索上下文的忠实程度，越高越好）。

    请返回符合以下JSON Schema格式的输出：
    {json.dumps(Reason.model_json_schema(), ensure_ascii=False)}
    不要使用单引号，使用双引号并正确转义。

    示例JSON：
    {{
        "reason": "<你的原因>"
    }}

    请基于判决结果简洁说明：
    - 如果有不一致（verdict=0）的陈述，指出哪部分内容在检索上下文中不存在
    - 如果全部一致，简单肯定回答的忠实性
    - 保持1-2句话的简洁表达，避免冗长描述
    -----------------------------

    现在对以下输入执行相同操作
    输入: {{
        "faithfulness_score": {score},
        "verdicts": {verdicts}
    }}
    输出: """

        template_en = f"""Given the faithfulness score and verdicts list, provide a CONCISE summary of the evaluation result. Do NOT include the numeric score in your reason.

    The verdicts list contains verdict information for each statement, where each verdict includes:
    - statement: the original statement
    - reason: the reason for the verdict
    - verdict: the verdict result (0 means inconsistent, 1 means consistent)

    The faithfulness score is a 0-1 score indicating how faithful the actual output is to the retrieval context (higher the better).

    Please return the output in a JSON format that complies with the following schema as specified in JSON Schema:
    {json.dumps(Reason.model_json_schema())}
    Do not use single quotes in your response but double quotes, properly escaped with a backslash.

    Example JSON:
    {{
        "reason": "<your_reason>"
    }}

    Please provide a concise summary based on the verdict results:
    - If there are inconsistent statements (verdict=0), point out which content is not found in the retrieval context
    - If all statements are consistent, simply affirm the answer's faithfulness
    - Keep it to 1-2 sentences, avoid lengthy descriptions
    -----------------------------

    Now perform the same with the following input
    input: {{
        "faithfulness_score": {score},
        "verdicts": {verdicts}
    }}
    Output: """

        return template_zh if language == Language.CHINESE else template_en
