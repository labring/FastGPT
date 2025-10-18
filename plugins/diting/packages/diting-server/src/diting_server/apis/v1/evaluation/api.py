#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from fastapi import APIRouter, HTTPException, status, Request
from diting_server.apis.v1.evaluation.data_models import (
    EvaluationRequest,
    EvaluationResponse,
)
from diting_server.common.logging_config.config import get_logger
from diting_server.services.evaluation.evaluation_service import evaluation_service
from diting_server.middleware.request_tracking import get_request_id_from_scope

router = APIRouter(prefix="/api/v1/evaluations", tags=["evaluations"])
logger = get_logger(__name__)


@router.post("/runs", response_model=EvaluationResponse)
async def run_evaluation(
    request: EvaluationRequest, http_request: Request
) -> EvaluationResponse:
    request_id = get_request_id_from_scope(http_request.scope)

    try:
        result = await evaluation_service.run_evaluation(request, request_id)
        return result
    except Exception as e:
        logger.error("Evaluation failed", request_id=request_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Evaluation task execution failed: {str(e)}",
        )
