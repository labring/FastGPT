# -*- coding: utf-8 -*-

from fastapi import APIRouter

from . import data_source

router = APIRouter()

router.include_router(data_source.router, prefix="/data_source", tags=["data_source"])
