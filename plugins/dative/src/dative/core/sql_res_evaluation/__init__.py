# -*- coding: utf-8 -*-

import asyncio
from json import JSONDecodeError
from typing import Any, cast

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage

from ..utils import cal_tokens, text2json

prompt = """
# Database info
{db_info}

# evidence:
{evidence}

# Original user query:
{query}

# Generated SQL:
{generated_sql}

# SQL query results:
{sql_result}

# Constraints:
- 1. Evaluate the relevance and quality of the SQL query results to the original user query.
- 2. If SQL results is empty or relevant, according to the above information directly answer the user's question, do not output "according to", "based on" and other redundant phrases.
  Respond in the following JSON format:
  {{
    "final_answer": "Return a full natural language answer"
  }}
- 3. If SQL results is not empty and not relevant, explain of why the SQL query is not relevant.
  Respond in the following JSON format:
  {{
    "explanation": "explanation of why the SQL query is not relevant"
  }}
"""  # noqa:E501


async def arun(
    query: str,
    llm: BaseChatModel,
    db_info: str,
    sql: str,
    res_rows: list[tuple[Any, ...]],
    evidence: str | None = None,
) -> tuple[str, int, int, str | None]:
    answer = ""
    error = None
    input_tokens, output_tokens = 0, 0
    human_msg = prompt.format(
        db_info=db_info,
        query=query,
        generated_sql=sql,
        sql_result=res_rows,
        evidence=evidence or "",
    )
    try:
        content = ""
        async for chunk in llm.astream([HumanMessage(human_msg)]):
            msg = cast(AIMessage, chunk)
            content += cast(str, msg.content)
            input_tokens, output_tokens = await asyncio.to_thread(cal_tokens, msg)
    except Exception as e:
        raise ValueError(f"调用LLM失败：{e}")

    try:
        result = await asyncio.to_thread(text2json, cast(str, content))
        if "final_answer" in result:
            answer = result["final_answer"] or ""
        else:
            error = result.get("explanation", "")
    except JSONDecodeError:
        error = "Incorrect json format"

    return answer, input_tokens, output_tokens, error
