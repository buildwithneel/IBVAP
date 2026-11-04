# IBVAP — Integrated Border Video Analytics Platform

[![Python](https://img.shields.io/badge/Python-3.10%2B-blue.svg?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.109%2B-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-19.0-61DAFB.svg?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![YOLOv8](https://img.shields.io/badge/YOLOv8-Ultralytics-00FFFF.svg?logo=ultralytics&logoColor=black)](https://github.com/ultralytics/ultralytics)
[![PyTorch](https://img.shields.io/badge/PyTorch-2.0%2B-EE4C2C.svg?logo=pytorch&logoColor=white)](https://pytorch.org/)
[![Vite](https://img.shields.io/badge/Vite-8.3-646CFF.svg?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.0-38B2AC.svg?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

An enterprise-grade, high-throughput autonomous border surveillance and tactical video analytics platform. IBVAP integrates real-time computer vision inference, multi-camera fleet orchestration, interactive geospatial virtual fencing, cryptographic chain-of-custody evidence verification, and an operator command-and-control console.

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [System Architecture](#system-architecture)
- [Technology Stack](#technology-stack)
- [Project Directory Structure](#project-directory-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Configuration](#environment-configuration)
- [Running the Platform](#running-the-platform)
  - [Unified Launcher (Windows)](#unified-launcher-windows)
  - [Manual Execution](#manual-execution)
  - [Docker Compose](#docker-compose)
- [API & WebSocket Specification](#api--websocket-specification)
- [Verification & Testing](#verification--testing)
- [Security & Compliance](#security--compliance)
- [License](#license)

---

## Overview

Traditional border monitoring faces operational challenges: remote geographical terrain, adverse weather, limited bandwidth, and human operator alert fatigue across dozens of concurrent feeds. 

**IBVAP** provides an end-to-end automated perimeter defense solution:
- Ingests multiple heterogeneous camera feeds (live RTSP streams, local devices, or recorded high-definition surveillance files).
- Executes continuous multi-class object detection and tracking in real time.
- Enforces user-defined and AI-assisted geospatial perimeter boundaries (virtual fences and tripwires).
- Automatically captures forensic evidence snapshots and video clips sealed with SHA-256 cryptographic hashes.
- Maintains a tamper-evident audit ledger recording every operational decision and system action.
## 🏆 Smart India Hackathon 2026 (SIH 2026)

**IBVAP (Integrated Border Video Analytics Platform)** is a project developed as part of **Smart India Hackathon 2026 (SIH 2026)**.

The project focuses on developing an AI-powered border surveillance and video analytics platform to support intelligent perimeter monitoring, real-time threat detection, multi-camera surveillance, and evidence management.

### Project Highlights
- AI-powered real-time object detection using YOLOv8.
- Multi-camera surveillance and centralized monitoring.
- Intelligent virtual fencing and intrusion detection.
- Automated incident evidence capture and verification.
- Geospatial monitoring and tactical command interface.

**Project:** Integrated Border Video Analytics Platform (IBVAP)  
**Hackathon:** Smart India Hackathon 2026  
**Domain:** Artificial Intelligence, Computer Vision & Border Surveillance
---

## Key Features

### 1. Multi-Camera Fleet Management
- **Scalable Fleet Support**: Simultaneous monitoring of up to 24 camera feeds with sector-based filtering (Sector Alpha, Bravo, Charlie, Delta).
- **Flexible Grid Layouts**: 5 operational layouts (1×1 Focus, 2×2 Quad, 3×3 Matrix, 4×4 Fleet, and 24-Fleet Overview).
- **ONVIF Camera Integration & PTZ**: Pan-Tilt-Zoom directional controls, zoom sliders, camera presets, and LAN device discovery.
- **Hardware Telemetry HUD**: Live overlays showing frame rate (FPS), neural inference latency (ms), connection status, and resolution telemetry.

### 2. Real-Time Computer Vision Pipeline
- **YOLOv8 Detection**: High-accuracy detection of persons, motor vehicles, motorcycles, and wildlife on CPU or CUDA-accelerated GPU.
- **ByteTrack Multi-Object Tracking**: Persistent track ID retention across frames with Kalman filter state estimation and occlusion coasting.
- **Automatic Number Plate Recognition (ANPR)**: Automatic vehicle cropping, CLAHE image enhancement, OCR extraction, and multi-frame temporal voting for plate resolution.
- **Facial Landmark Bounding**: Privacy-preserving facial bounding box localization without uncalibrated facial identification guessing.

### 3. Spatial & Behavioral Virtual Fencing
- **Interactive Polygon Zones**: Point-and-click polygon drawing over camera feeds with ray-casting Point-in-Polygon (PIP) intrusion verification.
- **Directional Tripwires**: Vector-based line crossing detection (`outside -> inside` directional enforcement).
- **Loitering Detection**: Per-track dwell-time accumulation triggering alarms when targets remain within restricted zones beyond configured thresholds.
- **Night Movement Monitoring**: Frame luminance analysis coupled with configurable curfew windows to catch unauthorized nocturnal movement.
- **Human-In-The-Loop (HITL) Validation**: Staged boundary changes requiring operator confirmation before taking effect.

### 4. Cryptographic Evidence & Audit Ledger
- **Automatic Evidence Capture**: Circular ring-buffer captures 150-frame pre/post-incident video clips (`.mp4`) and high-resolution JPEG snapshots upon verified intrusion.
- **FIPS PUB 180-4 SHA-256 Hashing**: Instant file-level hashing on creation with real-time byte re-verification via `/api/v1/evidence/{id}/verify`.
- **Tamper-Evident Audit Trail**: Blockchain-style sequential hash-chained audit blocks ensuring operational logs cannot be retroactively modified or deleted.

### 5. Tactical Command & Control Interface
- **Geospatial Tactical Map**: Integrated Leaflet.js interactive map plotting cameras, security sectors, and geo-referenced active alerts.
- **Incident Lifecycle Management**: End-to-end operational workflows: `Detected` &rarr; `Acknowledge Threat` &rarr; `Investigate` &rarr; `Escalate to QRT` &rarr; `Resolve`.
- **AI Explainability Cards**: Transparent step-by-step reasoning for every alert (classification confidence, polygon coordinate check, velocity metrics, and fused risk scores).

---

## System Architecture

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 SURVEILLANCE WORKFLOW                                  │
└────────────────────────────────────────────────────────────────────────────────────────┘

 [RTSP IP Cameras]     [Local USB / Webcams]     [Video Uploads (.mp4/.mkv)]
         │                       │                           │
         └───────────────────────┼───────────────────────────┘
                                 ▼
                 ┌───────────────────────────────┐
                 │    Stream Ingestion Worker    │
                 │   (Decodes & Buffers Frames)  │
                 └───────────────┬───────────────┘
                                 │
                                 ▼
                 ┌───────────────────────────────┐
                 │     AI Computer Vision Core   │
                 │  - Ultralytics YOLOv8n        │
                 │  - ByteTrack Persistent ID    │
                 │  - ANPR & Face Localization   │
                 └───────────────┬───────────────┘
                                 │
                                 ▼
                 ┌───────────────────────────────┐
                 │    Spatial & Behavioral Engine│
                 │  - Ray-Casting Virtual Fence  │
                 │  - Directional Tripwires      │
                 │  - Dwell-Time Loitering       │
                 │  - Night Luminance Analysis   │
                 └───────────────┬───────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
     ┌────────────────────────┐      ┌────────────────────────┐
     │  Cryptographic Engine  │      │  FastAPI Event Engine  │
     │  - SHA-256 File Hashing│      │  - REST API Endpoints  │
     │  - Ring-Buffer Clips   │      │  - Real-Time WebSocket │
     │  - Hash-Chained Ledger │      │  - MJPEG Streaming     │
     └────────────────────────┘      └───────────┬────────────┘
                                                 │
                                                 ▼
                                     ┌────────────────────────┐
                                     │ React Tactical Console │
                                     │  - 24-Fleet Video Grid │
                                     │  - Geospatial Map      │
                                     │  - Incident Custody    │
                                     │  - Audit Verification  │
                                     └────────────────────────┘
```

---

## Technology Stack

| Layer | Technologies | Description |
|---|---|---|
| **Frontend UI** | React 19, TypeScript, Vite, Tailwind CSS | High-performance responsive tactical command interface |
| **Mapping & Geospatial** | Leaflet.js, React-Leaflet | Tactical border map with GPS-positioned camera markers |
| **Icons & Motion** | Lucide React, Framer Motion | Crisp tactical iconography and smooth state transitions |
| **Backend Framework** | FastAPI, Uvicorn, Python 3.10+ | Asynchronous RESTful APIs and low-latency WebSocket hub |
| **Computer Vision & AI** | Ultralytics YOLOv8, OpenCV, PyTorch | Deep neural network object detection and image analysis |
| **Object Tracking** | ByteTrack, Kalman Filter | Inter-frame target association and trajectory prediction |
| **Database & ORM** | SQLAlchemy 2.0, SQLite (Dev), PostgreSQL (Prod) | Structured persistence for cameras, events, and incidents |
| **Security & Cryptography** | python-jose, passlib (bcrypt), hashlib (SHA-256) | Role-based JWT access tokens and immutable hash ledgers |
| **DevOps & Containers** | Docker, Docker Compose | Containerized reproducible deployment |

---

## Project Directory Structure

```text
IBVAP/
├── backend/
│   ├── app/
│   │   ├── ai/                     # Computer vision pipeline (YOLO, ByteTrack, ANPR, Zones, Behaviour)
│   │   ├── api/v1/                 # Versioned REST routers (cameras, streams, events, audit, etc.)
│   │   ├── core/                   # Configuration (pydantic-settings), security (JWT/bcrypt), logging
│   │   ├── db/                     # Database connection, schemas, and SQLAlchemy ORM models
│   │   ├── schemas/                # Pydantic request/response validation schemas
│   │   ├── services/               # Core business services (camera, event, evidence, audit, PTZ)
│   │   └── workers/                # Background multithreaded frame decoding & video workers
│   ├── models/                     # Deep learning neural network weights (.pt)
│   ├── storage/                    # Local storage directory (evidence clips/snapshots, uploads)
│   ├── tests/                      # Automated test suite (backend, telemetry, AI pipeline)
│   ├── Dockerfile                  # Backend container configuration
│   ├── docker-compose.yml          # Compose file for Backend + PostgreSQL
│   ├── requirements.txt            # Python dependencies
│   └── .env.example                # Backend environment configuration template
│
├── src/
│   ├── assets/                     # Emblems, heraldry, and branding graphics
│   ├── components/                 # Reusable UI modules (CameraFeedTile, VirtualFence, Map, PTZ)
│   ├── context/                    # Surveillance stream and officer profile React contexts
│   ├── pages/                      # Application pages (Dashboard, CameraFeed, Analysis, Reports, Login)
│   ├── services/                   # Frontend REST API client and WebSocket service
│   ├── types.ts                    # TypeScript domain interfaces and type definitions
│   ├── App.tsx                     # Top-level routing and providers
│   ├── index.css                   # Tailwind CSS styling and theme definitions
│   └── main.tsx                    # React application entry point
│
├── public/                         # Static assets (favicons, manifest)
├── .env.example                    # Frontend environment configuration template
├── .gitignore                      # Git exclusion rules
├── launch.bat                      # Windows one-click platform launcher
├── package.json                    # Frontend dependencies and npm scripts
├── tsconfig.json                   # TypeScript compiler configuration
└── vite.config.ts                  # Vite build tool and development configuration
```

---

## Getting Started

### Prerequisites

- **Python**: Version 3.10 or higher
- **Node.js**: Version 18.0 or higher (with `npm`)
- **FFmpeg**: Required on system path for video clipping and ring-buffer stream encoding
- **Git**: For version control

---

### Installation

#### 1. Clone the Repository
```bash
git clone https://github.com/buildwithneel/IBVAP.git
cd IBVAP
```

#### 2. Backend Environment Setup
```bash
cd backend

# Create and activate Python virtual environment
python -m venv venv

# On Windows:
venv\Scripts\activate

# On Linux/macOS:
source venv/bin/activate

# Install required dependencies
pip install -r requirements.txt
cd ..
```

#### 3. Frontend Environment Setup
```bash
# From the project root
npm install
```

---

### Environment Configuration

#### Frontend (`.env`)
Copy the frontend template in the project root:
```bash
# Windows PowerShell
Copy-Item .env.example .env

# Linux / macOS
cp .env.example .env
```
Key frontend variables:
```env
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_WS_BASE_URL=ws://127.0.0.1:8000/ws
```

#### Backend (`backend/.env`)
Copy the backend template inside the `backend/` directory:
```bash
# Windows PowerShell
Copy-Item backend\.env.example backend\.env

# Linux / macOS
cp backend/.env.example backend/.env
```
Key backend variables:
```env
PROJECT_NAME="IBVAP - Intelligent Border Video Analytics Platform"
SECRET_KEY="replace-with-a-secure-random-secret-key"
DATABASE_URL="sqlite:///./ibvap.db"
STORAGE_DIR="storage"
CORS_ORIGINS=["http://localhost:5173","http://127.0.0.1:5173"]
```

---

## Running the Platform

### Unified Launcher (Windows)
For convenience on Windows systems, double-click or execute the included batch script from the repository root:
```cmd
launch.bat
```
This script verifies Node.js and Python, validates dependencies, launches the FastAPI backend and Vite frontend in separate consoles, and opens the application in your browser.

---

### Manual Execution

#### Terminal 1: Backend Service
```bash
cd backend
# Ensure virtual environment is active
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
- **Interactive OpenAPI Documentation**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **Alternative ReDoc**: [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)
- **Live WebSocket Hub**: `ws://127.0.0.1:8000/ws`

#### Terminal 2: Frontend Tactical Console
```bash
# From the project root
npm run dev
```
- **Web Application Portal**: [http://localhost:5173](http://localhost:5173)

---

### Docker Compose
To deploy the backend with PostgreSQL in Docker containers:
```bash
cd backend
docker-compose up --build -d
```

---

## API & WebSocket Specification

### Primary REST Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/auth/login` | Authenticate operator credentials and receive JWT access token |
| `GET` | `/api/v1/cameras` | Retrieve full fleet status and telemetry (supports sector filtering) |
| `POST` | `/api/v1/cameras` | Register a new RTSP or hardware camera into the fleet |
| `POST` | `/api/v1/cameras/{id}/ptz` | Issue Pan/Tilt/Zoom or preset movement commands |
| `POST` | `/api/v1/streams/upload` | Ingest local video file to spawn an AI processing worker |
| `GET` | `/api/v1/streams/{id}/mjpeg` | Live MJPEG stream annotated with bounding boxes and track IDs |
| `GET` | `/api/v1/events` | Query chronological detection and intrusion events |
| `GET` | `/api/v1/zones` | Retrieve active virtual fences, tripwires, and restricted polygons |
| `POST` | `/api/v1/zones` | Create custom polygon zone or tripwire (HITL staged) |
| `POST` | `/api/v1/zones/{id}/confirm` | Confirm staged virtual boundary into production enforcement |
| `GET` | `/api/v1/evidence` | List captured incident snapshots and video clips |
| `GET` | `/api/v1/evidence/{id}/verify` | Cryptographically verify SHA-256 hash against disk contents |
| `GET` | `/api/v1/audit` | Retrieve immutable operational audit trail |
| `GET` | `/api/v1/audit/verify` | Verify entire cryptographic audit block hash chain |
| `GET` | `/api/v1/health` | Comprehensive subsystem health and diagnostic check |

### WebSocket Real-Time Stream (`/ws`)
Subscribers receive instantaneous JSON push updates whenever events or detections occur:
```json
{
  "type": "NEW_EVENT",
  "data": {
    "id": "EVT-8942-01",
    "camera_id": "CAM-01",
    "event_type": "INTRUSION",
    "severity": "CRITICAL",
    "risk_score": 88.5,
    "timestamp": "2026-10-11T20:15:30.412Z",
    "explanation": "Target #14 crossed perimeter line with 92% confidence."
  }
}
```

---

## Verification & Testing

### Backend Automated Test Suite
The backend includes automated tests covering API endpoints, AI inference, telemetry synchronization, virtual fencing, and cryptographic verification:
```bash
python -m pytest backend/tests -v
```

### Frontend Build & Type Validation
To validate TypeScript types and build the production bundle:
```bash
npm run build
```

---

## Security & Compliance

1. **Tamper-Evident Evidence Storage**: Every video clip and snapshot captured by the system is immediately fingerprinted using SHA-256 (FIPS PUB 180-4). The hash is stored independently in the database. Any modification of the underlying media file on disk causes instant validation failure.
2. **Sequential Hash-Chained Audit Ledger**: All critical system actions (threat acknowledgments, manual fence creations, QRT dispatches, user logins) are written to a cryptographic ledger where each block references the previous block's hash.
3. **Role-Based Access Control**: Sensitive actions require authenticated operator sessions using HS256-signed JWTs with bcrypt password hashing.
4. **Environment Isolation**: API credentials, database strings, and secret keys are managed through `.env` files and never tracked in source control.

---

## License

This project is licensed under the [MIT License](LICENSE).
