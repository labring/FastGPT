#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from typing import List
import json
from diting_core.metrics.faithfulness.schema import Statements, Verdicts, Reason


class FaithfulnessTemplate:
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
        retrieval_context: str,
        statements: List[str],
    ) -> str:
        return f"""Your task is to judge the faithfulness of a series of statements based on a given context. For each statement you must return verdict as 1 if the statement can be directly inferred based on the context or 0 if the statement can not be directly inferred based on the context.
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
    "statements": [
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
    "statements": [
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

    @staticmethod
    def generate_reason(score: float, contradictions: List[str]):
        return f"""Below is a list of Contradictions. It is a list of strings explaining why the 'actual output' does not align with the information presented in the 'retrieval context'. Contradictions happen in the 'actual output', NOT the 'retrieval context'.
Given the faithfulness score, which is a 0-1 score indicating how faithful the `actual output` is to the retrieval context (higher the better), CONCISELY summarize the contradictions to justify the score. 

Please return the output in a JSON format that complies with the following schema as specified in JSON Schema:
{json.dumps(Reason.model_json_schema())}
Do not use single quotes in your response but double quotes, properly escaped with a backslash.

Example JSON:
{{
    "reason": "The score is <faithfulness_score> because <your_reason>."
}}

If there are no contradictions, just say something positive with an upbeat encouraging tone (but don't overdo it otherwise it gets annoying).
Your reason MUST use information in `contradiction` in your reason.
Be sure in your reason, as if you know what the actual output is from the contradictions.
-----------------------------

Now perform the same with the following input
input: {{
    "faithfulness_score": {score},
    "contradictions": {contradictions},
}}
Output: """
