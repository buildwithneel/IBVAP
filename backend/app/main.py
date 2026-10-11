import os
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.logging import setup_logging, logger
from app.db.database import engine, Base, init_db_schema
from app.services.event_service import EventService

from app.api.v1 import (
    auth, cameras, streams, detections, events, zones, evidence, watchlist, audit, health, incidents, test_streams, rules
)
from app.devtools.local_camera import routes as local_camera_devtools

# Initialize logging
setup_logging()

# Initialize DB tables and migrate columns
init_db_schema()

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Real Backend & AI/CV layer for IBVAP - Intelligent Border Video Analytics Platform (SIH 26187)",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS Configuration
origins = [
    "*",
    "http://localhost",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static storage for evidence snapshots & video files
storage_path = os.path.abspath(settings.resolved_storage_dir)
os.makedirs(storage_path, exist_ok=True)

# Mount static files BEFORE CORS middleware so we can add a CORS header injector
app.mount("/storage", StaticFiles(directory=storage_path), name="storage")

# Add a middleware to inject CORS headers on all responses (covers StaticFiles mounts
# which bypass CORSMiddleware). This ensures video/media files can be loaded cross-origin.
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest
from starlette.responses import Response as StarletteResponse

class CORSStaticMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: StarletteRequest, call_next):
        response = await call_next(request)
        origin = request.headers.get("origin", "*")
        response.headers["Access-Control-Allow-Origin"] = origin if origin != "*" else "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, HEAD, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "*"
        response.headers["Access-Control-Expose-Headers"] = "Content-Range, Accept-Ranges, Content-Length"
        return response

app.add_middleware(CORSStaticMiddleware)

# 1. Versioned API Routers (/api/v1)
app.include_router(auth.router, prefix="/api/v1")
app.include_router(cameras.router, prefix="/api/v1")
app.include_router(streams.router, prefix="/api/v1")
app.include_router(detections.router, prefix="/api/v1")
app.include_router(events.router, prefix="/api/v1")
app.include_router(zones.router, prefix="/api/v1")
app.include_router(evidence.router, prefix="/api/v1")
app.include_router(watchlist.router, prefix="/api/v1")
app.include_router(audit.router, prefix="/api/v1")
app.include_router(health.router, prefix="/api/v1")
app.include_router(incidents.router, prefix="/api/v1")
app.include_router(local_camera_devtools.router, prefix="/api/v1")
app.include_router(test_streams.router, prefix="/api/v1")
app.include_router(rules.router, prefix="/api/v1")

# 2. Canonical Frontend Prefix Routers (/api)
app.include_router(auth.router, prefix="/api")
app.include_router(cameras.router, prefix="/api")
app.include_router(streams.router, prefix="/api")
app.include_router(detections.router, prefix="/api")
app.include_router(events.router, prefix="/api")
app.include_router(zones.router, prefix="/api")
app.include_router(evidence.router, prefix="/api")
app.include_router(watchlist.router, prefix="/api")
app.include_router(audit.router, prefix="/api")
app.include_router(health.router, prefix="/api")
app.include_router(incidents.router, prefix="/api")
app.include_router(local_camera_devtools.router, prefix="/api")
app.include_router(test_streams.router, prefix="/api")
app.include_router(rules.router, prefix="/api")

# 3. Direct Root Fallback Routers (/)
app.include_router(auth.router)
app.include_router(cameras.router)
app.include_router(streams.router)
app.include_router(detections.router)
app.include_router(events.router)
app.include_router(zones.router)
app.include_router(evidence.router)
app.include_router(watchlist.router)
app.include_router(audit.router)
app.include_router(health.router)
app.include_router(incidents.router)
app.include_router(local_camera_devtools.router)
app.include_router(test_streams.router)
app.include_router(rules.router)

@app.on_event("startup")
def startup_event():
    import asyncio
    try:
        EventService.set_main_loop(asyncio.get_running_loop())
    except RuntimeError:
        pass
    
    # 1. Start periodic telemetry broadcaster
    EventService.start_telemetry_broadcaster()

    # 2. Auto-initialize and start configured cameras and test streams
    try:
        from app.db.database import SessionLocal
        from app.services.camera_service import CameraService
        from app.api.v1.test_streams import sync_all_uploaded_videos_to_cameras
        from app.workers.video_worker import worker_manager
        
        db = SessionLocal()
        # Ensure full 24-camera fleet exists idempotently
        CameraService.ensure_24_cameras(db)
        sim_cams = sync_all_uploaded_videos_to_cameras(db)
        for item in sim_cams:
            cam_id = item["camera_id"]
            video_path = item["video"]["file_path"]
            if not worker_manager.is_running(cam_id):
                worker_manager.start_worker(cam_id, "file", video_path)
        db.close()
        logger.info(f"Initialized and auto-started {len(sim_cams)} simulated surveillance cameras.")
    except Exception as e:
        logger.error(f"Error auto-starting simulated cameras on startup: {e}")

    logger.info("IBVAP Surveillance Backend & AI Engine initialized cleanly.")

# WebSocket for Real-Time Event & Detection Broadcasting
@app.websocket("/ws")
@app.websocket("/api/ws")
@app.websocket("/api/v1/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    EventService.register_ws(websocket)
    logger.info("WebSocket client connected.")

    # Send initial connection confirmation
    await websocket.send_json({
        "type": "CONNECTED",
        "message": "Connected to IBVAP Real-Time Surveillance Stream",
        "timestamp": settings.PROJECT_NAME
    })

    # Send immediate initial telemetry snapshot
    try:
        snap = EventService.get_telemetry_snapshot()
        await websocket.send_json(snap)
    except Exception as e:
        logger.debug(f"Failed to send initial telemetry snapshot: {e}")

    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        EventService.unregister_ws(websocket)
        logger.info("WebSocket client disconnected.")
    except Exception as e:
        EventService.unregister_ws(websocket)
        logger.error(f"WebSocket exception: {e}")
