from typing import List
from diting_core.metrics.utils import Language


class AnswerRelevancyTemplate:
    @staticmethod
    def generate_statements(actual_output: str, language: Language = Language.ENGLISH):
        template_zh = f"""给定文本，分解并生成其中包含的陈述列表。模糊的陈述和单个词汇也可以被视为陈述。

重要：生成的陈述必须与输入文本使用相同的语言。如果输入是中文，生成中文陈述。如果输入是英文，生成英文陈述。不要翻译或改变语言，在整个回复中保持原始语言。

示例：
示例文本：
我们的新款笔记本电脑具有高分辨率视网膜显示屏，呈现水晶般清晰的视觉效果。它还包括快速充电电池，单次充电可提供长达12小时的使用时间。在安全方面，我们添加了指纹认证和加密SSD。此外，每次购买都享有一年保修和24/7客户支持。

{{
    "statements": [
        "新款笔记本电脑具有高分辨率视网膜显示屏。",
        "它包括快速充电电池，单次充电可提供长达12小时的使用时间。",
        "安全功能包括指纹认证和加密SSD。",
        "每次购买都享有一年保修。",
        "提供24/7客户支持。"
    ]
}}
===== 示例结束 ======

**
重要：请确保只返回JSON格式，使用"statements"键映射到字符串列表。不需要其他文字或解释。
**

文本：
{actual_output}

JSON："""

        template_en = f"""Given the text, breakdown and generate a list of statements presented. Ambiguous statements and single words can also be considered as statements.

IMPORTANT: Generate statements in the SAME LANGUAGE as the input text. If the input is in Chinese, generate Chinese statements. If the input is in English, generate English statements. Do not translate or change the language. Maintain the original language throughout your response.

Example:
Example text:
Our new laptop model features a high-resolution Retina display for crystal-clear visuals. It also includes a fast-charging battery, giving you up to 12 hours of usage on a single charge. For security, we've added fingerprint authentication and an encrypted SSD. Plus, every purchase comes with a one-year warranty and 24/7 customer support.

{{
    "statements": [
        "The new laptop model has a high-resolution Retina display.",
        "It includes a fast-charging battery with up to 12 hours of usage.",
        "Security features include fingerprint authentication and an encrypted SSD.",
        "Every purchase comes with a one-year warranty.",
        "24/7 customer support is included."
    ]
}}
===== END OF EXAMPLE ======

**
IMPORTANT: Please make sure to only return in JSON format, with the "statements" key mapping to a list of strings. No words or explanation is needed.
**

Text:
{actual_output}

JSON:
"""

        return template_zh if language == Language.CHINESE else template_en

    @staticmethod
    def generate_verdicts(
        user_input: str, statements: List[str], language: Language = Language.ENGLISH
    ):
        template_zh = f"""对于提供的陈述列表，判断每个陈述是否与回答输入相关。
请生成一个包含两个键的JSON列表：`verdict`和`reason`。

重要：提供原因时，使用与输入相同的语言。如果输入是中文，请用中文提供原因。如果输入是英文，请用英文提供原因。
'verdict'键必须严格为'yes'、'idk'或'no'之一。如果陈述与回答原始输入相关，回答'yes'；如果陈述不相关，回答'no'；如果模糊不清（例如，不直接相关但可以用作回答输入的支撑点），回答'idk'。
'reason'是判决的原因。
仅当答案为'no'时才提供'reason'。
提供的陈述是实际输出中的陈述。

**
重要：请确保只返回JSON格式，使用'verdicts'键映射到JSON对象列表。
示例输入：
新款笔记本电脑有哪些功能？

示例陈述：
[
    "新款笔记本电脑具有高分辨率视网膜显示屏。",
    "它包括快速充电电池，单次充电可提供长达12小时的使用时间。",
    "安全功能包括指纹认证和加密SSD。",
    "每次购买都享有一年保修。",
    "提供24/7客户支持。",
    "菠萝放在比萨上很好吃。"
]

示例JSON：
{{
    "verdicts": [
        {{
            "verdict": "yes"
        }},
        {{
            "verdict": "yes"
        }},
        {{
            "verdict": "yes"
        }},
        {{
            "verdict": "no",
            "reason": "一年保修是购买优惠，不是笔记本电脑本身的功能。"
        }},
        {{
            "verdict": "no",
            "reason": "客户支持是服务，不是笔记本电脑的功能。"
        }},
        {{
            "verdict": "no",
            "reason": "关于菠萝比萨的陈述与询问笔记本电脑功能的输入完全无关。"
        }}
    ]
}}

由于您将为每个陈述生成一个判决，'verdicts'的数量必须严格等于'statements'的数量。
**

输入：
{user_input}

陈述：
{statements}

JSON："""

        template_en = f"""For the provided list of statements, determine whether each statement is relevant to address the input.
Please generate a list of JSON with two keys: `verdict` and `reason`.

IMPORTANT: When providing reasons, use the SAME LANGUAGE as the input. If the input is in Chinese, provide reasons in Chinese. If the input is in English, provide reasons in English.
The 'verdict' key should STRICTLY be either a 'yes', 'idk' or 'no'. Answer 'yes' if the statement is relevant to addressing the original input, 'no' if the statement is irrelevant, and 'idk' if it is ambiguous (eg., not directly relevant but could be used as a supporting point to address the input).
The 'reason' is the reason for the verdict.
Provide a 'reason' ONLY if the answer is 'no'.
The provided statements are statements made in the actual output.

**
IMPORTANT: Please make sure to only return in JSON format, with the 'verdicts' key mapping to a list of JSON objects.
Example input:
What features does the new laptop have?

Example statements:
[
    "The new laptop model has a high-resolution Retina display.",
    "It includes a fast-charging battery with up to 12 hours of usage.",
    "Security features include fingerprint authentication and an encrypted SSD.",
    "Every purchase comes with a one-year warranty.",
    "24/7 customer support is included.",
    "Pineapples taste great on pizza."
]

Example JSON:
{{
    "verdicts": [
        {{
            "verdict": "yes"
        }},
        {{
            "verdict": "yes"
        }},
        {{
            "verdict": "yes"
        }},
        {{
            "verdict": "no",
            "reason": "A one-year warranty is a purchase benefit, not a feature of the laptop itself."
        }},
        {{
            "verdict": "no",
            "reason": "Customer support is a service, not a feature of the laptop."
        }},
        {{
            "verdict": "no",
            "reason": "The statement about pineapples on pizza is completely irrelevant to the input, which asks about laptop features."
        }}
    ]
}}

Since you are going to generate a verdict for each statement, the number of 'verdicts' SHOULD BE STRICTLY EQUAL to the number of `statements`.
**

Input:
{user_input}

Statements:
{statements}

JSON:
"""

        return template_zh if language == Language.CHINESE else template_en

    @staticmethod
    def generate_reason(
        irrelevant_statements: List[str],
        input: str,
        score: float,
        language: Language = Language.ENGLISH,
    ):
        template_zh = f"""给定答案相关性得分、不相关陈述的原因列表和输入，请简洁地总结评估结果。不要在原因中包含数字分数。基于相关性解释评估结果。

不相关陈述代表实际输出中与输入所询问或讨论的内容无关的部分。
如果没有不相关的内容，就用积极鼓励的语调说些正面的话（但不要过度）。

**
重要：请确保只返回JSON格式，使用'reason'键提供原因。
示例JSON：
{{
    "reason": "<你的原因>"
}}
**

答案相关性得分：
{score}

基于实际输出中不相关陈述导致分数无法更高的原因：
{irrelevant_statements}

输入：
{input}

JSON："""

        template_en = f"""Given the answer relevancy score, the list of reasons of irrelevant statements made in the actual output, and the input, provide a CONCISE reason. Do NOT include the numeric score in your reason. Explain the evaluation result based on relevancy.

IMPORTANT: Provide your reason in the SAME LANGUAGE as the input. If the input is in Chinese, respond in Chinese. If the input is in English, respond in English.
The irrelevant statements represent things in the actual output that is irrelevant to addressing whatever is asked/talked about in the input.
If there is nothing irrelevant, just say something positive with an upbeat encouraging tone (but don't overdo it otherwise it gets annoying).

**
IMPORTANT: Please make sure to only return in JSON format, with the 'reason' key providing the reason.
Example JSON:
{{
    "reason": "<your_reason>"
}}
**

Answer Relevancy Score:
{score}

Reasons why the score can't be higher based on irrelevant statements in the actual output:
{irrelevant_statements}

Input:
{input}

JSON:
"""

        return template_zh if language == Language.CHINESE else template_en
