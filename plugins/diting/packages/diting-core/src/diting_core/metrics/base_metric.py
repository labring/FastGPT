import typing as t
from abc import ABC, abstractmethod
from dataclasses import dataclass

from diting_core.callbacks.manager import new_group
from diting_core.utilities.slug import camel_to_snake
from diting_core.cases.llm_case import LLMCase, LLMCaseParams, assert_testcase_validity


@dataclass
class MetricValue:
    metric_name: t.Optional[str] = None
    score: t.Optional[float] = None
    reason: t.Optional[str] = None
    run_logs: t.Optional[t.Dict[str, t.Any]] = None

    def __str__(self):
        return (
            f"MetricValue(metric={self.metric_name}, "
            f"score={self.score}, "
            f"reason={self.reason}, "
            f"run_logs={self.run_logs})"
        )


class BaseMetric(ABC):
    # run config
    include_reason: bool = False
    _required_params: t.List[LLMCaseParams] = []

    async def compute(
        self,
        test_case: LLMCase,
        *args: t.Any,
        **kwargs: t.Any,
    ) -> MetricValue:
        """Compute metric value for a test case.

        Parameters
        ----------
        test_case : LLMCase
            The test case to evaluate.
        *args : t.Tuple[t.Any]
            Additional positional arguments.
        **kwargs : t.Dict[str, t.Any]
            verbose : bool
                Whether to enable verbose mode. Defaults to False.
            callbacks : Callbacks
                The callback register to the evaluation
            Other Additional keyword arguments.

        Returns
        -------
        MetricValue
            Container with score, reason, and run logs.

        Raises
        ------
        NotImplementedError
            If _compute method is not implemented in subclass.

        Notes
        -----
        1. Validates test case against required parameters
        2. Executes pre-computation callbacks
        3. Executes computation
        4. Executes post-computation callbacks
        """

        run_manager, grp_cb = None, None
        callbacks = kwargs.pop("callbacks", None)
        verbose = kwargs.get("verbose", False)
        if verbose or callbacks:
            from diting_core.callbacks.base import ChainType

            run_manager, grp_cb = await new_group(
                name=self.name,
                inputs={"test_case": test_case},
                callbacks=callbacks,
                verbose=verbose,
                chain_type=ChainType.METRIC,
                required_params=self._required_params,
            )
        try:
            assert_testcase_validity(self.name, test_case, self._required_params)
            metric_value = await self._compute(
                test_case, callbacks=grp_cb, *args, **kwargs
            )
            metric_value.metric_name = self.name
        except Exception as e:
            if run_manager:
                await run_manager.on_chain_error(e)
            raise e

        if run_manager:
            await run_manager.on_chain_end({"metric_value": metric_value})
        return metric_value

    @abstractmethod
    async def _compute(
        self,
        test_case: LLMCase,
        *args: t.Any,
        **kwargs: t.Any,
    ) -> MetricValue:
        """Abstract method to perform actual metric computation.

        Parameters
        ----------
        test_case : LLMCase
            The test case to evaluate.
        *args : t.Tuple[t.Any]
            Additional positional arguments.
        **kwargs : t.Dict[str, t.Any]
            Additional keyword arguments.

        Returns
        -------
        MetricValue
            Container with score, reason, and run logs.

        Raises
        ------
        NotImplementedError
            If not implemented in subclass.
        """

        raise NotImplementedError

    @property
    def name(self) -> str:
        return camel_to_snake(self.__class__.__name__)
