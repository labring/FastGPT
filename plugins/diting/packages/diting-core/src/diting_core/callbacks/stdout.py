#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Callback Handler that prints to std out."""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any, Optional, Dict
from uuid import UUID

from typing_extensions import override

from diting_core.callbacks.base import AsyncCallbackHandler, ChainRun, ChainType
from diting_core.utilities.print import print_text, get_colored_text, get_bolded_text


def get_name(serialized: dict[str, Any], **kwargs: Any) -> str:
    if "name" in kwargs:
        name = kwargs["name"]
    elif serialized:
        name = serialized.get("name", serialized.get("id", ["<unknown>"])[-1])
    else:
        name = "<unknown>"

    return name


class StdOutCallbackHandler(AsyncCallbackHandler):
    """Callback Handler that prints to std out."""

    traces: Dict[str, ChainRun] = {}

    @override
    async def on_chain_start(
        self,
        serialized: Dict[str, Any],
        inputs: Dict[str, Any],
        *,
        run_id: UUID,
        parent_run_id: Optional[UUID] = None,
        metadata: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> None:
        name = get_name(serialized, **kwargs)
        chain_type = kwargs.get("chain_type") or ChainType.FUNC
        chain_run = ChainRun(
            run_id=str(run_id),
            parent_run_id=str(parent_run_id) if parent_run_id else None,
            chain_type=chain_type,
            name=name,
            inputs=inputs,
            metadata=metadata or {},
            children=[],
        )
        self.traces[str(run_id)] = chain_run
        if parent_run_id and str(parent_run_id) in self.traces:
            parent_trace = self.traces[str(parent_run_id)]
            if parent_trace.children is None:
                parent_trace.children = []

            parent_trace.children.append(str(run_id))

        if chain_type == ChainType.METRIC:
            print(
                f"Starting {get_colored_text(name, color='green')} evaluation algorithm"
            )
            required_params = kwargs.get("required_params") or None
            if required_params:
                required_params_info = ", ".join(
                    [get_colored_text(p.name, color="green") for p in required_params]
                )
                print(
                    f"Algorithm requires the following parameters: {required_params_info}"
                )
            test_case = inputs.get("test_case") or None
            if test_case:
                print(get_bolded_text("Test Case Information:"))
                print(get_colored_text(str(test_case), "blue"))

        else:
            print(f"\nStarting {get_colored_text(name, color='green')} run")

            print(get_bolded_text("Inputs Information:"))
            print(get_colored_text(str(inputs), "blue"))

        print(get_bolded_text("Start Time:"))
        print(get_colored_text(str(chain_run.start_time), "blue"))

        print(get_bolded_text("Run ID:"))
        print(get_colored_text(str(chain_run.run_id), "blue"))

        print(get_bolded_text("Parent Run ID:"))
        print(get_colored_text(str(chain_run.parent_run_id), "blue"))

    @override
    async def on_chain_end(
        self,
        outputs: Dict[str, Any],
        *,
        run_id: UUID,
        parent_run_id: Optional[UUID] = None,
        **kwargs: Any,
    ) -> None:
        chain_run = self.traces[str(run_id)]
        chain_run.outputs = outputs

        end_counter: float = time.perf_counter()
        chain_run.end_counter = end_counter
        chain_run.end_time = datetime.now(timezone.utc)

        duration = int((end_counter - chain_run.start_counter) * 1000)

        self.traces.pop(str(run_id))

        print(
            f"{get_colored_text(chain_run.name, color='green')} Run Complete! Total time taken: {duration} ms"
        )

        if chain_run.chain_type == ChainType.METRIC:
            metric_value = outputs.get("metric_value") or None
            if metric_value:
                print(get_bolded_text("Metric Value:"))
                print(get_colored_text(str(metric_value), color="green"))
        else:
            print(get_bolded_text("Outputs Information:"))
            print(get_colored_text(str(outputs), color="green"))

        print(get_bolded_text("End Time:"))
        print(get_colored_text(str(chain_run.end_time), "blue"))

        print(get_bolded_text("Run ID:"))
        print(get_colored_text(str(chain_run.run_id), "blue"))

        print(get_bolded_text("Parent Run ID:"))
        print(get_colored_text(str(chain_run.parent_run_id), "blue"))

    @override
    async def on_chain_error(
        self,
        error: BaseException,
        *,
        run_id: UUID,
        parent_run_id: Optional[UUID] = None,
        **kwargs: Any,
    ) -> None:
        chain_run = self.traces[str(run_id)]
        self.traces.pop(str(run_id))
        print(f"{get_colored_text(chain_run.name, color='red')} Run Error!")
        print(get_bolded_text("Error Stack:"))
        print_text(
            str(error),
            "red",
            end="\n",
        )
