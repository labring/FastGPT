from typing import Dict
import pkgutil
import importlib
from typing import Type

from diting_core.metrics.base_metric import BaseMetric
from diting_core.utilities.slug import camel_to_snake

_diting_metric_module_name = "diting_core.metrics"


def discover_metrics(
    base_module_name: str = _diting_metric_module_name,
    recursive: bool = True,
    include_abstract: bool = False,
) -> Dict[str, Type[BaseMetric]]:
    """
    metrics discovery with additional options.

    Args:
        base_module_name: The base module name to search for metrics
        recursive: Whether to search submodules recursively
        include_abstract: Whether to include abstract base classes

    Returns:
        Dict mapping metric class names to their corresponding classes
    """
    metrics: Dict[str, Type[BaseMetric]] = {}

    def _is_valid_metric_class(cls):  # type: ignore
        """Check if a class is a valid metric class."""
        if not isinstance(cls, type):
            return False
        if not issubclass(cls, BaseMetric):
            return False
        if cls is BaseMetric:
            return False
        if not include_abstract and getattr(cls, "__abstractmethods__", None):
            return False
        return True

    try:
        base_module = importlib.import_module(base_module_name)

        # Check the base module itself
        for attr_name in dir(base_module):
            attr = getattr(base_module, attr_name)
            if _is_valid_metric_class(attr):
                metrics[camel_to_snake(attr.__name__)] = attr

        # Search submodules if recursive
        if recursive:
            for module_info in pkgutil.walk_packages(
                base_module.__path__, prefix=f"{base_module_name}."
            ):
                try:
                    module = importlib.import_module(module_info.name)
                    for attr_name in dir(module):
                        attr = getattr(module, attr_name)
                        if _is_valid_metric_class(attr):
                            metrics[camel_to_snake(attr.__name__)] = attr

                except ImportError as e:
                    print(f"Warning: Could not import {module_info.name}: {e}")
                    continue

    except ImportError as e:
        print(f"Error: Could not import base module {base_module_name}: {e}")
        return {}

    return metrics


class MetricFactory:
    def __init__(self):
        self.metrics: Dict[str, Type[BaseMetric]] = discover_metrics()

    def create(self, metric_type: str) -> Type[BaseMetric]:
        """
        Create a metric instance based on the type and configuration.

        Args:
            metric_type: Type of the metric to create
            threshold: Threshold value for the metric

        Returns:
            An instance of a metric class
        """
        if metric_type in self.metrics:
            return self.metrics[metric_type]
        else:
            raise ValueError(f"Unknown metric type: {metric_type}")
