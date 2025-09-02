#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from fastapi import APIRouter, HTTPException, status
import uuid
from diting_server.apis.v1.evaluation.data_models import (
    EvaluationRequest,
    EvaluationResponse,
)
from diting_server.common.logging_config.config import get_logger
from diting_server.services.evaluation.evaluation_service import evaluation_service

router = APIRouter(prefix="/api/v1/evaluations", tags=["evaluations"])
logger = get_logger(__name__)


@router.post("/runs", response_model=EvaluationResponse)
async def run_evaluation(request: EvaluationRequest) -> EvaluationResponse:
    request_id = str(uuid.uuid4())
    try:
        logger.info(f"Starting evaluation task, request_id: {request_id}")
        result = await evaluation_service.run_evaluation(request, request_id)
        logger.info(f"Evaluation task completed, request_id: {request_id}")
        return result
    except Exception as e:
        logger.error(f"Evaluation failed, request_id: {request_id}, error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Evaluation task execution failed: {str(e)}",
        )
