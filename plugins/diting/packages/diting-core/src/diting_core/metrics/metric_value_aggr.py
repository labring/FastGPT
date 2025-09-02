#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from collections import defaultdict
from dataclasses import dataclass, field
from typing import List, Dict, Any, no_type_check, Optional
import statistics as stats
from diting_core.metrics.base_metric import MetricValue
from diting_core.metrics.answer_correctness.answer_correctness import AnswerCorrectness
from diting_core.metrics.answer_relevancy.answer_relevancy import AnswerRelevancy
from diting_core.metrics.answer_similarity.answer_similarity import AnswerSimilarity
from diting_core.metrics.context_recall.context_recall import ContextRecall
from diting_core.metrics.faithfulness.faithfulness import Faithfulness
from diting_core.metrics.qa_quality.qa_quality import QAQuality


class MetricScoreScope:
    def __init__(self, lower: float, upper: float):
        if lower >= upper:
            raise ValueError("Lower bound must be less than upper bound.")
        self.lower = lower
        self.upper = upper

    def __str__(self):
        return f"[{self.lower}, {self.upper})"

    def __repr__(self):
        return self.__str__()

    def contains(self, score: float) -> bool:
        """检查分数是否在范围内（左闭右开）"""
        return self.lower <= score < self.upper


Qualified = "Qualified"
UnQualified = "UnQualified"
DEFAULT_METRIC_RESULT_MAPPINGS = {
    AnswerCorrectness().name: {
        UnQualified: MetricScoreScope(0, 0.8),
        Qualified: MetricScoreScope(0.8, 1.0 + 1e-8),
    },
    AnswerRelevancy().name: {
        UnQualified: MetricScoreScope(0, 0.8),
        Qualified: MetricScoreScope(0.8, 1.0 + 1e-8),
    },
    AnswerSimilarity().name: {
        UnQualified: MetricScoreScope(0, 0.8),
        Qualified: MetricScoreScope(0.8, 1.0 + 1e-8),
    },
    ContextRecall().name: {
        UnQualified: MetricScoreScope(0, 0.8),
        Qualified: MetricScoreScope(0.8, 1.0 + 1e-8),
    },
    Faithfulness().name: {
        UnQualified: MetricScoreScope(0, 0.8),
        Qualified: MetricScoreScope(0.8, 1.0 + 1e-8),
    },
    QAQuality().name: {
        UnQualified: MetricScoreScope(0, 0.8),
        Qualified: MetricScoreScope(0.8, 1.0 + 1e-8),
    },
}


@dataclass
class MetricValueAggregator:
    metric_values: List[MetricValue] = field(default_factory=list[MetricValue])

    @no_type_check
    def aggregate(self, stats_to_calculate: List[str]) -> Dict[str, Dict[str, Any]]:
        """Aggregates metric values by metric_name and computes specified statistics.

        Args:
            stats_to_calculate (List[str]): A list of statistics to calculate (e.g., ['mean', 'median']).

        Returns:
            Dict[str, Dict[str, Any]]: A dictionary containing aggregated results for each metric_name.
        """
        grouped_metrics = defaultdict(list)

        # Group metric values by metric_name
        for metric_value in self.metric_values:
            if metric_value.metric_name and metric_value.score is not None:
                grouped_metrics[metric_value.metric_name].append(metric_value.score)

        # Calculate specified statistics for each group
        aggregated_results = {}
        for metric_name, scores in grouped_metrics.items():
            aggregated_results[metric_name] = {}
            if "mean" in stats_to_calculate:
                aggregated_results[metric_name]["mean"] = stats.mean(scores)
            if "max" in stats_to_calculate:
                aggregated_results[metric_name]["max"] = max(scores)
            if "min" in stats_to_calculate:
                aggregated_results[metric_name]["min"] = min(scores)
            if "variance" in stats_to_calculate:
                aggregated_results[metric_name]["variance"] = stats.variance(scores)
            if "median" in stats_to_calculate:
                aggregated_results[metric_name]["median"] = stats.median(scores)

        return aggregated_results

    def result_mapping(
        self,
        mappings: Optional[Dict[str, Dict[str, MetricScoreScope]]] = None,
    ) -> Dict[str, Dict[str, str]]:
        """Maps scores to labels based on the provided mappings and calculates label distribution.

        Args:
            mappings (Dict[str, Dict[str, str]]): A dictionary mapping metric names to their score range mappings.

        Returns:
            Dict[str, Dict[str, str]]: A dictionary containing label distribution for each metric_name.
        """
        if mappings is None:
            mappings = DEFAULT_METRIC_RESULT_MAPPINGS
        label_distributions: Dict[str, Dict[str, int]] = defaultdict(
            lambda: defaultdict(int)
        )
        total_counts: Dict[str, int] = defaultdict(int)

        for metric_value in self.metric_values:
            if metric_value.score is not None and metric_value.metric_name in mappings:
                label = self.map_score_to_label(
                    metric_value.score, mappings[metric_value.metric_name]
                )
                if label:
                    label_distributions[metric_value.metric_name][label] += 1
                    total_counts[metric_value.metric_name] += 1

        label_distributions_fmt: Dict[str, Dict[str, str]] = defaultdict(
            lambda: defaultdict(str)
        )
        # Calculate percentage distribution
        for metric_name in label_distributions:
            for label in label_distributions[metric_name]:
                if total_counts[metric_name] > 0:
                    label_count = label_distributions[metric_name][label]
                    label_distributions_fmt[metric_name][label] = (
                        f"{(label_count / total_counts[metric_name]) * 100:.2f}%"
                    )

        return {
            metric_name: dict(label_distribution)
            for metric_name, label_distribution in label_distributions_fmt.items()
        }

    def map_score_to_label(
        self, score: float, mapping: Dict[str, MetricScoreScope]
    ) -> Optional[str]:
        """Maps a score to a label based on the provided mapping."""
        for label, scope in mapping.items():
            if scope.contains(score):
                return label
        return None


# examples
# if __name__ == "__main__":
#     metrics = [
#         MetricValue(metric_name="accuracy", score=0.9),
#         MetricValue(metric_name="accuracy", score=0.85),
#         MetricValue(metric_name="accuracy", score=0.95),
#         MetricValue(metric_name="accuracy", score=0.4),
#         MetricValue(metric_name="precision", score=0.6),
#         MetricValue(metric_name="precision", score=0.7),
#         MetricValue(metric_name="precision", score=0.8),
#     ]
#
#     aggregator = MetricValueAggregator(metric_values=metrics)
#
#     # 定义每个指标的结果映射
#     mappings = {
#         "accuracy": {"fail": MetricScoreScope(0, 0.5), "success": MetricScoreScope(0.5, 1)},
#         "precision": {"low": MetricScoreScope(0, 0.7), "high": MetricScoreScope(0.7, 1)},
#     }
#
#     label_distribution = aggregator.result_mapping(mappings)
#     print("Label Distribution:", label_distribution)
