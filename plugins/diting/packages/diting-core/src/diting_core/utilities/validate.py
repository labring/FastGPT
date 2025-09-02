#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from typing import Union, Dict, Any, Optional, List
from pydantic import BaseModel


def assert_fields_validity(
    operator_name: str,
    data: Union[Dict[str, Any], BaseModel],
    required_params: Optional[List[str]],
) -> None:
    if required_params is None:
        return
    missing_params: List[str] = []
    for param in required_params:
        if isinstance(data, Dict):
            if data.get(param) is None:
                missing_params.append(f"'{param}'")
        else:
            if getattr(data, param) is None:
                missing_params.append(f"'{param}'")

    if missing_params:
        if len(missing_params) == 1:
            missing_params_str = missing_params[0]
        elif len(missing_params) == 2:
            missing_params_str = " and ".join(missing_params)
        else:
            missing_params_str = (
                ", ".join(missing_params[:-1]) + ", and " + missing_params[-1]
            )

        error_str = f"{missing_params_str} cannot be None for the '{operator_name}' run"
        raise ValueError(error_str)
