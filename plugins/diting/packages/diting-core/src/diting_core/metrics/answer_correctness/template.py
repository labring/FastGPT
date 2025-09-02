#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from typing import List
import json
from diting_core.metrics.answer_correctness.schema import Verdicts, Statements, Reason


class AnswerCorrectnessTemplate:
    @staticmethod
    def generate_statements(user_input: str, text: str) -> str:
        return f"""Given a question and an answer, analyze the complexity of each sentence in the answer. Break down each sentence into one or more fully understandable statements. Ensure that no pronouns are used in any statement. Format the outputs in JSON.
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

    @staticmethod
    def generate_verdicts(
        user_input: str,
        actual_output_statements: List[str],
        expected_output_statements: list[str],
    ) -> str:
        return f"""Given a ground truth and an answer statements, analyze each statement and classify them in one of the following categories: TP (true positive): statements that are present in answer that are also directly supported by the one or more statements in ground truth, FP (false positive): statements present in the answer but not directly supported by any statement in ground truth, FN (false negative): statements found in the ground truth but not present in answer. Each statement can only belong to one of the categories. Provide a reason for each classification.
Please return the output in a JSON format that complies with the following schema as specified in JSON Schema:
{json.dumps(Verdicts.model_json_schema())}
Do not use single quotes in your response but double quotes, properly escaped with a backslash.

--------EXAMPLES-----------
Example 1
Input: {{
    "question": "What powers the sun and what is its primary function?",
    "answer": [
        "The sun is powered by nuclear fission, similar to nuclear reactors on Earth.",
        "The primary function of the sun is to provide light to the solar system."
    ],
    "ground_truth": [
        "The sun is powered by nuclear fusion, where hydrogen atoms fuse to form helium.",
        "This fusion process in the sun's core releases a tremendous amount of energy.",
        "The energy from the sun provides heat and light, which are essential for life on Earth.",
        "The sun's light plays a critical role in Earth's climate system.",
        "Sunlight helps to drive the weather and ocean currents."
    ]
}}
Output: {{
    "TP": [
        {{
            "statement": "The primary function of the sun is to provide light to the solar system.",
            "reason": "This statement is somewhat supported by the ground truth mentioning the sun providing light and its roles, though it focuses more broadly on the sun's energy."
        }}
    ],
    "FP": [
        {{
            "statement": "The sun is powered by nuclear fission, similar to nuclear reactors on Earth.",
            "reason": "This statement is incorrect and contradicts the ground truth which states that the sun is powered by nuclear fusion."
        }}
    ],
    "FN": [
        {{
            "statement": "The sun is powered by nuclear fusion, where hydrogen atoms fuse to form helium.",
            "reason": "This accurate description of the sun’s power source is not included in the answer."
        }},
        {{
            "statement": "This fusion process in the sun's core releases a tremendous amount of energy.",
            "reason": "This process and its significance are not mentioned in the answer."
        }},
        {{
            "statement": "The energy from the sun provides heat and light, which are essential for life on Earth.",
            "reason": "The answer only mentions light, omitting the essential aspects of heat and its necessity for life, which the ground truth covers."
        }},
        {{
            "statement": "The sun's light plays a critical role in Earth's climate system.",
            "reason": "This broader impact of the sun’s light on Earth's climate system is not addressed in the answer."
        }},
        {{
            "statement": "Sunlight helps to drive the weather and ocean currents.",
            "reason": "The effect of sunlight on weather patterns and ocean currents is omitted in the answer."
        }}
    ]
}}

Example 2
Input: {{
    "question": "What is the boiling point of water?",
    "answer": [
        "The boiling point of water is 100 degrees Celsius at sea level"
    ],
    "ground_truth": [
        "The boiling point of water is 100 degrees Celsius (212 degrees Fahrenheit) at sea level.",
        "The boiling point of water can change with altitude."
    ]
}}
Output: {{
    "TP": [
        {{
            "statement": "The boiling point of water is 100 degrees Celsius at sea level",
            "reason": "This statement is directly supported by the ground truth which specifies the boiling point of water as 100 degrees Celsius at sea level."
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
    "ground_truth": {expected_output_statements}
}}
Output: """

    @staticmethod
    def generate_reasons(
        score: float,
        tp_reasons: List[str],
        fp_reasons: List[str],
        fn_reasons: List[str],
    ) -> str:
        return f"""Given the answer correctness score, the list of reasons of TP, FP, FN:
- **Correctly Included (TP)**: Statements in the response that are factually accurate and directly supported by the ground truth.
- **Incorrectly Added (FP)**: Statements in the response that are not supported by the ground truth.
- **Missing (FN)**: Important facts present in the ground truth but absent from the response.
These categories are for analysis only. When generating your explanation, do NOT use the terms "TP", "FP", "FN", "true positive", 
or any technical evaluation jargon. Provide a concise and user-friendly reason for the score using plain, natural language.

Please return the output in a JSON format that complies with the following schema as specified in JSON Schema:
{json.dumps(Reason.model_json_schema())}
Do not use single quotes in your response but double quotes, properly escaped with a backslash.

Example JSON:
{{
    "reason": "The score is <answer_correctness_score> because because <your_reason>."
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
