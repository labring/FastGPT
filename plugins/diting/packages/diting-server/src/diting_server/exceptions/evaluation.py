#!/usr/bin/env python3
# -*- coding: utf-8 -*-
class EvaluationException(Exception):
    pass


class MetricNotFoundException(EvaluationException):
    pass


class InvalidInputException(EvaluationException):
    pass


class ModelConfigException(EvaluationException):
    pass


class MetricComputeException(EvaluationException):
    pass
