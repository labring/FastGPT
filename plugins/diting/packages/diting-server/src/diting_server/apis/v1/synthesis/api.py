#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from fastapi import APIRouter, HTTPException, status
import uuid
from diting_server.common.logging_config.config import get_logger
from diting_server.apis.v1.synthesis.data_models import (
    DatasetSynthesisRequest,
    DatasetSynthesisResponse,
)

from diting_server.services.synthesis.synthesis_service import synthesizer_service

router = APIRouter(prefix="/api/v1/dataset-synthesis", tags=["dataset-synthesis"])
logger = get_logger(__name__)


@router.post("/runs", response_model=DatasetSynthesisResponse)
async def run_synthesis(request: DatasetSynthesisRequest) -> DatasetSynthesisResponse:
    request_id = str(uuid.uuid4())
    try:
        logger.info(f"Starting synthesis task, request_id: : {request_id}")
        result = await synthesizer_service.run_synthesizer(request, request_id)
        logger.info(f"Synthesis task completed, request_id: {request_id}")
        return result
    except Exception as e:
        logger.error(f"Synthesis failed, request_id: {request_id}, error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Synthesis task execution failed: {str(e)}",
        )
