#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json
from typing import Any
from diting_core.metrics.context_precision.schema import Verdict, Reason


class ContextPrecisionTemplate:
    @staticmethod
    def generate_verdict(user_input: str, expected_output: str, context: str) -> str:
        return f"""Given question, answer and context verify if the context was useful in arriving at the given answer. Give verdict as "1" if useful and "0" if not with json output.
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
    "question": "who won 2020 icc world cup?",
    "context": "The 2022 ICC Men's T20 World Cup, held from October 16 to November 13, 2022, in Australia, was the eighth edition of the tournament. Originally scheduled for 2020, it was postponed due to the COVID-19 pandemic. England emerged victorious, defeating Pakistan by five wickets in the final to clinch their second ICC Men's T20 World Cup title.",
    "answer": "England"
}}
Output: {{
    "reason": "the context was useful in clarifying the situation regarding the 2020 ICC World Cup and indicating that England was the winner of the tournament that was intended to be held in 2020 but actually took place in 2022.",
    "verdict": 1
}}

Example 3
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

    @staticmethod
    def generate_reason(user_input: str, score: float, verdicts: list[dict[str, Any]]):
        return f"""Given the input, retrieval contexts, and contextual precision score, provide a CONCISE summary for the score. Explain why it is not higher, but also why it is at its current score.
The retrieval contexts is a list of JSON with three keys: `verdict`, `reason` (reason for the verdict) and `node`. `verdict` will be either 'yes' or 'no', which represents whether the corresponding 'node' in the retrieval context is relevant to the input. 
Contextual precision represents if the relevant nodes are ranked higher than irrelevant nodes. Also note that retrieval contexts is given IN THE ORDER OF THEIR RANKINGS.

Please return the output in a JSON format that complies with the following schema as specified in JSON Schema:
{json.dumps(Reason.model_json_schema())}
Do not use single quotes in your response but double quotes, properly escaped with a backslash.

Example JSON:
{{
    "reason": "The score is <contextual_precision_score> because <your_reason>."
}}

In your reason, you MUST USE the `reason`, QUOTES in the 'reason', and the node RANK (starting from 1, eg. first node) to explain why the 'no' verdicts should be ranked lower than the 'yes' verdicts.
When addressing nodes, make it explicit that they are nodes in retrieval contexts.
If the score is 1, keep it short and say something positive with an upbeat tone (but don't overdo it, otherwise it gets annoying).
-----------------------------

Now perform the same with the following input
input: {{
    "input": {user_input},
    "contextual_precision_score": {score},
    "retrieval_contexts": {verdicts},
}}
Output: """
