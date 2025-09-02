#!/usr/bin/env python3
# -*- coding: utf-8 -*-
class SynthesisException(Exception):
    pass


class SynthesizerNotFoundException(SynthesisException):
    pass


class InvalidInputException(SynthesisException):
    pass


class ModelConfigException(SynthesisException):
    pass


class SynthesizerApplyException(SynthesisException):
    pass
