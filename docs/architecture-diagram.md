# CDR Test Quality Suite - GKE Architecture Diagram

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              INTERNET / USERS                                │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                                      │ HTTPS
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Google Cloud Load Balancer                            │
│                         (Ingress with SSL/TLS)                               │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                                      │
        ┌─────────────────────────────┴─────────────────────────────┐
        │                                                             │
        │          GOOGLE KUBERNETES ENGINE (GKE) CLUSTER            │
        │                    (Regional/Autopilot)                    │
        │                                                             │
        │  ┌──────────────────────────────────────────────────────┐ │
        │  │              Kubernetes Service Layer                 │ │
        │  │           (LoadBalancer/ClusterIP)                    │ │
        │  └────────────────────────┬─────────────────────────────┘ │
        │                           │                                │
        │  ┌────────────────────────┴─────────────────────────────┐ │
        │  │                                                        │ │
        │  │  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓  │ │
        │  │  ┃     Node.js Express Backend (Pods 1-3)       ┃  │ │
        │  │  ┃  - React Frontend (Vite + Material UI)       ┃  │ │
        │  │  ┃  - Express API Server                        ┃  │ │
        │  │  ┃  - Async Job Management                      ┃  │ │
        │  │  ┃  - Port: 5000                                ┃  │ │
        │  │  ┃  - Health Checks: /api/health                ┃  │ │
        │  │  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛  │ │
        │  │           │                         │                  │ │
        │  │           │                         │                  │ │
        │  │           ▼                         ▼                  │ │
        │  │  ┏━━━━━━━━━━━━━━━━━━━━┓   ┏━━━━━━━━━━━━━━━━━━━━━┓  │ │
        │  │  ┃  FastAPI Service   ┃   ┃   GCS Service        ┃  │ │
        │  │  ┃  (Python Pod)      ┃   ┃   (Job Storage)      ┃  │ │
        │  │  ┃  - Port: 8000      ┃   ┃   - Hybrid Storage   ┃  │ │
        │  │  ┃  - Vertex AI SDK   ┃   ┃   - Atomic Writes    ┃  │ │
        │  │  ┗━━━━━━━━━┬━━━━━━━━━━┛   ┗━━━━━━━━━┬━━━━━━━━━━━┛  │ │
        │  │             │                         │                │ │
        │  └─────────────┼─────────────────────────┼────────────────┘ │
        │                │                         │                  │
        └────────────────┼─────────────────────────┼──────────────────┘
                         │                         │
                         ▼                         ▼
        ┌────────────────────────────┐  ┌──────────────────────────┐
        │   Google Vertex AI         │  │  Google Cloud Storage    │
        │   - Reasoning Engine        │  │  - Job Metadata          │
        │   - Agent Sessions          │  │  - CSV Files             │
        │   - Test Case Generation    │  │  - Test Results          │
        └────────────────────────────┘  │  - Status Tracking       │
                                        └──────────────────────────┘
```

## Detailed Component Architecture

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND LAYER (React + Vite)                        │
├───────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  ┌──────────────────┐   │
│  │  Format     │  │  File Upload │  │  CCDA      │  │  JSON Results    │   │
│  │  Selector   │  │  Component   │  │  Config    │  │  Viewer          │   │
│  └─────────────┘  └──────────────┘  └────────────┘  └──────────────────┘   │
│                                                                                │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  ┌──────────────────┐   │
│  │  Polling    │  │  Zephyr CSV  │  │  ChatBot   │  │  Theme           │   │
│  │  Mechanism  │  │  Export      │  │  (FHIR AI) │  │  Provider        │   │
│  └─────────────┘  └──────────────┘  └────────────┘  └──────────────────┘   │
└───────────────────────────────────────┬───────────────────────────────────────┘
                                        │ React Query
                                        ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                        BACKEND LAYER (Express.js)                              │
├───────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  API ENDPOINTS:                                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │  Synchronous (HL7):                                                  │     │
│  │  • POST /api/generate_test_cases → FastAPI → Vertex AI             │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│                                                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │  Asynchronous (CCDA):                                                │     │
│  │  • POST /api/ccda-gen-test-cases  → Create Job + GitHub Fetch       │     │
│  │  • GET  /api/status/:jobId        → Poll Job Status                 │     │
│  │  • GET  /api/results/:jobId       → Fetch Test Cases                │     │
│  │  • GET  /api/download/:jobId      → Download Zephyr CSV             │     │
│  │  • GET  /api/jobs                 → List All Jobs                   │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│                                                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │  Other:                                                               │     │
│  │  • GET  /api/health               → Health Check                    │     │
│  │  • POST /api/chat                 → FHIR Expert Assistant           │     │
│  │  • POST /api/test-github-url      → Validate GitHub URLs            │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│                                                                                │
└────────────────────────────┬──────────────────────┬──────────────────────────┘
                             │                      │
                             ▼                      ▼
          ┌──────────────────────────┐   ┌─────────────────────────┐
          │   GCS Service Layer      │   │  FastAPI Microservice   │
          │   (Hybrid Storage)       │   │  (Python + Vertex AI)   │
          ├──────────────────────────┤   ├─────────────────────────┤
          │ • Job Status Tracking    │   │ • Vertex AI SDK         │
          │ • Metadata Management    │   │ • Agent Sessions        │
          │ • CSV Input/Output       │   │ • Reasoning Engine      │
          │ • Results Storage        │   │ • Test Generation       │
          │ • Atomic Writes          │   │ • Chat Interface        │
          │ • Real GCS + Local Mock  │   └─────────────────────────┘
          └──────────────────────────┘
```

## Data Flow Diagram - CCDA Async Workflow

```
┌──────────┐
│  User    │
│ Browser  │
└────┬─────┘
     │
     │ 1. Submit GitHub URL + Config
     ▼
┌─────────────────────────────┐
│   React Frontend            │
│   (CCDAConfigForm)          │
└────┬────────────────────────┘
     │
     │ 2. POST /api/ccda-gen-test-cases
     ▼
┌─────────────────────────────────────────────────────────┐
│   Express Backend                                        │
│   ┌─────────────────────────────────────────────────┐  │
│   │ 1. Validate Request (Zod)                       │  │
│   │ 2. Fetch CSV from GitHub                        │  │
│   │ 3. Create Job ID                                │  │
│   │ 4. Write Initial Status (pending)               │  │
│   │ 5. Return job_id IMMEDIATELY (5ms)              │  │
│   └─────────────────────────────────────────────────┘  │
│                                                          │
│   ┌─────────────────────────────────────────────────┐  │
│   │ Background Processing (setImmediate):           │  │
│   │ 1. Update Status → processing                   │  │
│   │ 2. Parse CSV                                    │  │
│   │ 3. Generate Test Cases (Mock: 2.5s delay)      │  │
│   │ 4. Calculate Statistics                         │  │
│   │ 5. Write Results to GCS                         │  │
│   │ 6. Generate Zephyr CSV                          │  │
│   │ 7. Update Status → completed                    │  │
│   └─────────────────────────────────────────────────┘  │
└────┬────────────────────────────────┬─────────────────┘
     │                                 │
     │                                 │
     ▼                                 ▼
┌─────────────────┐          ┌──────────────────────┐
│ Google Cloud    │          │  Local Mock Storage  │
│ Storage Bucket  │    OR    │  /tmp/gcs-mock/      │
│                 │          │  (Development)       │
│ jobs/{job-id}/  │          │                      │
│ • status.json   │          │  Atomic writes:      │
│ • metadata.json │          │  temp → rename       │
│ • input.csv     │          │                      │
│ • results.json  │          │                      │
│ • output.csv    │          │                      │
└─────────────────┘          └──────────────────────┘
     │
     │ 3. Frontend polls every 3 seconds
     ▼
┌─────────────────────────────┐
│   GET /api/status/:jobId    │
│   Returns: {                │
│     status: "completed",    │
│     created_at: "...",      │
│     updated_at: "..."       │
│   }                         │
└─────────────────────────────┘
     │
     │ 4. When completed, fetch results
     ▼
┌─────────────────────────────┐
│   GET /api/results/:jobId   │
│   Returns: {                │
│     test_cases: [...],      │
│     statistical_summary,    │
│     csv_download_url        │
│   }                         │
└─────────────────────────────┘
```

## Kubernetes Pod Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                    GKE Node (VM Instance)                        │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  CDR App Pod 1                                          │    │
│  │  ┌──────────────────────────────────────────────────┐  │    │
│  │  │  Container: cdr-app                               │  │    │
│  │  │  Image: cdr-test-suite:v1                         │  │    │
│  │  │  Port: 5000                                       │  │    │
│  │  │  Resources:                                       │  │    │
│  │  │    Requests: 512Mi RAM, 500m CPU                 │  │    │
│  │  │    Limits: 1Gi RAM, 1000m CPU                    │  │    │
│  │  │  Volume Mounts:                                   │  │    │
│  │  │    /secrets/gcs → GCS credentials                │  │    │
│  │  └──────────────────────────────────────────────────┘  │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  CDR App Pod 2  (Replica)                              │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  CDR App Pod 3  (Replica)                              │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  FastAPI Pod                                            │    │
│  │  ┌──────────────────────────────────────────────────┐  │    │
│  │  │  Container: fastapi-service                       │  │    │
│  │  │  Image: fastapi-vertexai:v1                       │  │    │
│  │  │  Port: 8000                                       │  │    │
│  │  │  Environment:                                     │  │    │
│  │  │    GOOGLE_APPLICATION_CREDENTIALS                 │  │    │
│  │  │    VERTEX_AI_PROJECT                              │  │    │
│  │  └──────────────────────────────────────────────────┘  │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Security & Secrets Management

```
┌─────────────────────────────────────────────────────────────┐
│                  Kubernetes Secrets                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  gcs-credentials:                                            │
│    ├─ key.json (Service Account JSON)                       │
│                                                              │
│  cdr-env-secrets:                                            │
│    ├─ NODE_ENV: production                                  │
│    ├─ GCS_BUCKET_NAME: {project}-cdr-jobs                   │
│                                                              │
│  api-keys:                                                   │
│    ├─ GOOGLE_CLOUD_PROJECT: {project-id}                    │
│    ├─ VERTEX_AI_LOCATION: us-central1                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
          │
          │ Mounted as volumes
          ▼
┌─────────────────────────────────────────────────────────────┐
│  Pod File System:                                            │
│  /secrets/gcs/key.json                                       │
│                                                              │
│  Environment Variables accessible in containers              │
└─────────────────────────────────────────────────────────────┘
```

## Network & Traffic Flow

```
                    ┌─────────────────┐
                    │   External IP   │
                    │  (Load Balancer)│
                    └────────┬────────┘
                             │
                    Port 80 (HTTP) / 443 (HTTPS)
                             │
                             ▼
                 ┌───────────────────────┐
                 │  Kubernetes Service   │
                 │  (LoadBalancer)       │
                 │  cdr-test-suite-svc   │
                 └───────────┬───────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │  Pod 1   │   │  Pod 2   │   │  Pod 3   │
        │  :5000   │   │  :5000   │   │  :5000   │
        └──────────┘   └──────────┘   └──────────┘
              │
              │ Internal DNS
              ▼
        ┌─────────────────┐
        │ FastAPI Service │
        │ (ClusterIP)     │
        │ fastapi-svc:8000│
        └─────────────────┘
              │
              ▼
        ┌─────────────────┐
        │  FastAPI Pod    │
        │     :8000       │
        └─────────────────┘
```

## Deployment Pipeline

```
┌──────────────┐
│  Developer   │
│  Local Code  │
└──────┬───────┘
       │
       │ git push
       ▼
┌──────────────────┐
│  GitHub/GitLab   │
│  Repository      │
└──────┬───────────┘
       │
       │ Trigger CI/CD
       ▼
┌──────────────────────────────────┐
│  GitHub Actions / Cloud Build    │
│  1. Run tests                    │
│  2. Build Docker image           │
│  3. Push to Artifact Registry    │
│  4. Update K8s deployment        │
└──────┬───────────────────────────┘
       │
       │ kubectl apply
       ▼
┌──────────────────────────────────┐
│  GKE Cluster                     │
│  Rolling Update:                 │
│  1. Create new pod               │
│  2. Wait for health check        │
│  3. Route traffic to new pod     │
│  4. Terminate old pod            │
└──────────────────────────────────┘
```

---

## Key Features

### High Availability
- **3 replicas** of main application
- **Regional GKE cluster** across multiple zones
- **Health checks** (liveness & readiness probes)
- **Auto-healing** pods

### Scalability
- **Horizontal Pod Autoscaler** (HPA)
- **Cluster Autoscaler** (GKE)
- **Min: 2 pods, Max: 10 pods**
- Scales based on CPU/Memory usage

### Security
- **Non-root containers**
- **Secret management** via Kubernetes Secrets
- **Service accounts** with minimal permissions
- **Network policies** (optional)
- **TLS/SSL** via managed certificates

### Reliability
- **Rolling updates** with zero downtime
- **Rollback capability**
- **Persistent job storage** (GCS)
- **Atomic writes** prevent data corruption
- **Health monitoring**

### Observability
- **Google Cloud Logging** integration
- **Cloud Monitoring** dashboards
- **Pod logs** accessible via kubectl
- **Metrics** via GKE metrics
