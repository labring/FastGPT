from dataclasses import field, dataclass
from typing import Type, Any, List, Optional, cast

from diting_core.callbacks.base import Callbacks
from diting_core.callbacks.manager import new_group
from diting_core.cases.llm_case import LLMCase, LLMCaseParams
from diting_core.metrics.base_metric import BaseMetric, MetricValue
from diting_core.metrics.custom_metric.template import CustomMetricTemplate
from diting_core.metrics.custom_metric.schema import CustomMetricVerdict
from diting_core.models.llms.base_model import BaseLLM


@dataclass
class CustomMetric(BaseMetric):
    model: Optional[BaseLLM] = None
    _required_params: List[LLMCaseParams] = field(
        default_factory=lambda: [
            LLMCaseParams.USER_INPUT,
        ]
    )
    evaluation_template: Type[CustomMetricTemplate] = CustomMetricTemplate

    async def _compute(
        self,
        test_case: LLMCase,
        *args: Any,
        callbacks: Optional[Callbacks] = None,
        **kwargs: Any,
    ) -> MetricValue:
        assert self.model is not None, "llm is not set"
        assert test_case.user_input, "user_input cannot be empty"
        assert test_case.actual_output, "actual_output cannot be empty"
        assert test_case.expected_output, "expected_output cannot be empty"
        assert test_case.metadata, "metadata cannot be empty"
        prompt = self.evaluation_template.generate_verdict(
            test_case.metadata.get("prompt", ""),
            test_case.user_input,
            test_case.actual_output,
            test_case.expected_output,
        )

        run_mgt, grp_cb = await new_group(
            name="_compute",
            inputs={"user_input": test_case.user_input},
            callbacks=callbacks,
        )
        try:
            verdict = cast(
                CustomMetricVerdict,
                await self.model.generate_structured_output(
                    prompt, schema=CustomMetricVerdict, callbacks=grp_cb
                ),
            )
        except Exception as e:
            await run_mgt.on_chain_error(e)
            raise e

        metric_value = MetricValue(
            score=verdict.score,
            reason=verdict.reason,
            run_logs={
                "verdict": verdict,
            },
        )
        await run_mgt.on_chain_end(outputs={"metric_value": metric_value})
        return metric_value
