#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import re


def camel_to_snake(name: str):
    """
    Convert a camelCase string to snake_case.
    eg: HaiThere -> hai_there
    """
    pattern = re.compile(r"(?<!^)(?=[A-Z])")
    return pattern.sub("_", name).lower()
