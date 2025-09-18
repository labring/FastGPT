from typing import List


class AnswerRelevancyTemplate:
    @staticmethod
    def generate_statements(actual_output: str):
        return f"""Given the text, breakdown and generate a list of statements presented. Ambiguous statements and single words can also be considered as statements.

IMPORTANT: Generate statements in the SAME LANGUAGE as the input text. If the input is in Chinese, generate Chinese statements. If the input is in English, generate English statements. Do not translate or change the language. Maintain the original language throughout your response.

Example:
Example text: 
Our new laptop model features a high-resolution Retina display for crystal-clear visuals. It also includes a fast-charging battery, giving you up to 12 hours of usage on a single charge. For security, we’ve added fingerprint authentication and an encrypted SSD. Plus, every purchase comes with a one-year warranty and 24/7 customer support.

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

    @staticmethod
    def generate_verdicts(user_input: str, statements: List[str]):
        return f"""For the provided list of statements, determine whether each statement is relevant to address the input.
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

    @staticmethod
    def generate_reason(irrelevant_statements: List[str], input: str, score: float):
        return f"""Given the answer relevancy score, the list of reasons of irrelevant statements made in the actual output, and the input, provide a CONCISE reason. Do NOT include the numeric score in your reason. Explain the evaluation result based on relevancy.

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
