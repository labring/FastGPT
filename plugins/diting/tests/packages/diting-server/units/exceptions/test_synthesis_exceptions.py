#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import pytest
from diting_server.exceptions.synthesis import (
    SynthesisException,
    SynthesizerNotFoundException,
    InvalidInputException,
    ModelConfigException,
    SynthesizerApplyException,
)


class TestSynthesisExceptions:
    """Test cases for synthesis exception classes."""

    def test_synthesis_exception_inheritance(self):
        """Test that SynthesisException inherits from Exception."""
        exception = SynthesisException("Test error")
        assert isinstance(exception, Exception)
        assert str(exception) == "Test error"

    def test_synthesizer_not_found_exception_inheritance(self):
        """Test that SynthesizerNotFoundException inherits from SynthesisException."""
        exception = SynthesizerNotFoundException("Synthesizer not found")
        assert isinstance(exception, SynthesisException)
        assert isinstance(exception, Exception)
        assert str(exception) == "Synthesizer not found"

    def test_invalid_input_exception_inheritance(self):
        """Test that InvalidInputException inherits from SynthesisException."""
        exception = InvalidInputException("Invalid input")
        assert isinstance(exception, SynthesisException)
        assert isinstance(exception, Exception)
        assert str(exception) == "Invalid input"

    def test_model_config_exception_inheritance(self):
        """Test that ModelConfigException inherits from SynthesisException."""
        exception = ModelConfigException("Model config error")
        assert isinstance(exception, SynthesisException)
        assert isinstance(exception, Exception)
        assert str(exception) == "Model config error"

    def test_synthesizer_apply_exception_inheritance(self):
        """Test that SynthesizerApplyException inherits from SynthesisException."""
        exception = SynthesizerApplyException("Apply error")
        assert isinstance(exception, SynthesisException)
        assert isinstance(exception, Exception)
        assert str(exception) == "Apply error"

    def test_exception_without_message(self):
        """Test exceptions can be created without a message."""
        exception = SynthesisException()
        assert str(exception) == ""

    def test_exception_with_custom_message(self):
        """Test exceptions with custom messages."""
        custom_message = "Custom synthesis error message with details"
        exception = SynthesizerNotFoundException(custom_message)
        assert str(exception) == custom_message

    def test_exception_raising_and_catching(self):
        """Test that exceptions can be raised and caught properly."""
        with pytest.raises(SynthesizerNotFoundException) as exc_info:
            raise SynthesizerNotFoundException("Test synthesizer not found")

        assert str(exc_info.value) == "Test synthesizer not found"
        assert isinstance(exc_info.value, SynthesisException)

    def test_exception_hierarchy_catching(self):
        """Test that parent exceptions can catch child exceptions."""
        with pytest.raises(SynthesisException):
            raise SynthesizerNotFoundException("Child exception")

    def test_multiple_exception_types(self):
        """Test multiple exception types can be raised."""
        exceptions = [
            SynthesizerNotFoundException("Synthesizer error"),
            InvalidInputException("Input error"),
            ModelConfigException("Config error"),
            SynthesizerApplyException("Apply error"),
        ]

        for exception in exceptions:
            with pytest.raises(SynthesisException):
                raise exception
