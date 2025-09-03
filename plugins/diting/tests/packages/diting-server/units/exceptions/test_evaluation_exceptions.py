#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import pytest
from diting_server.exceptions.evaluation import (
    EvaluationException,
    MetricNotFoundException,
    InvalidInputException,
    ModelConfigException,
    MetricComputeException,
)


class TestEvaluationExceptions:
    """Test cases for evaluation exception classes."""

    def test_evaluation_exception_inheritance(self):
        """Test that EvaluationException inherits from Exception."""
        exception = EvaluationException("Test error")
        assert isinstance(exception, Exception)
        assert str(exception) == "Test error"

    def test_metric_not_found_exception_inheritance(self):
        """Test that MetricNotFoundException inherits from EvaluationException."""
        exception = MetricNotFoundException("Metric not found")
        assert isinstance(exception, EvaluationException)
        assert isinstance(exception, Exception)
        assert str(exception) == "Metric not found"

    def test_invalid_input_exception_inheritance(self):
        """Test that InvalidInputException inherits from EvaluationException."""
        exception = InvalidInputException("Invalid input")
        assert isinstance(exception, EvaluationException)
        assert isinstance(exception, Exception)
        assert str(exception) == "Invalid input"

    def test_model_config_exception_inheritance(self):
        """Test that ModelConfigException inherits from EvaluationException."""
        exception = ModelConfigException("Model config error")
        assert isinstance(exception, EvaluationException)
        assert isinstance(exception, Exception)
        assert str(exception) == "Model config error"

    def test_metric_compute_exception_inheritance(self):
        """Test that MetricComputeException inherits from EvaluationException."""
        exception = MetricComputeException("Compute error")
        assert isinstance(exception, EvaluationException)
        assert isinstance(exception, Exception)
        assert str(exception) == "Compute error"

    def test_exception_without_message(self):
        """Test exceptions can be created without a message."""
        exception = EvaluationException()
        assert str(exception) == ""

    def test_exception_with_custom_message(self):
        """Test exceptions with custom messages."""
        custom_message = "Custom error message with details"
        exception = MetricNotFoundException(custom_message)
        assert str(exception) == custom_message

    def test_exception_raising_and_catching(self):
        """Test that exceptions can be raised and caught properly."""
        with pytest.raises(MetricNotFoundException) as exc_info:
            raise MetricNotFoundException("Test metric not found")

        assert str(exc_info.value) == "Test metric not found"
        assert isinstance(exc_info.value, EvaluationException)

    def test_exception_hierarchy_catching(self):
        """Test that parent exceptions can catch child exceptions."""
        with pytest.raises(EvaluationException):
            raise MetricNotFoundException("Child exception")

    def test_multiple_exception_types(self):
        """Test multiple exception types can be raised."""
        exceptions = [
            MetricNotFoundException("Metric error"),
            InvalidInputException("Input error"),
            ModelConfigException("Config error"),
            MetricComputeException("Compute error"),
        ]

        for exception in exceptions:
            with pytest.raises(EvaluationException):
                raise exception
