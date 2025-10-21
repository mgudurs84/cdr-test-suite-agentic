# Single-Pod Architecture Diagram

## Simple Deployment Architecture

```
                    ┌─────────────────┐
                    │   USERS         │
                    │   (Browser)     │
                    └────────┬────────┘
                             │
                             │ HTTP
                             ▼
        ┌────────────────────────────────────────┐
        │   Google Cloud Load Balancer           │
        │   External IP: 35.x.x.x                │
        │   Port: 80 (HTTP)                      │
        └────────────────┬───────────────────────┘
                         │
                         │
    ┌────────────────────┴─────────────────────────┐
    │                                               │
    │   GOOGLE KUBERNETES ENGINE (GKE) CLUSTER     │
    │                                               │
    │   ┌───────────────────────────────────────┐  │
    │   │  Kubernetes Service                   │  │
    │   │  Name: cdr-app-service                │  │
    │   │  Type: LoadBalancer                   │  │
    │   │  Port: 80 → 3000                      │  │
    │   └─────────────────┬─────────────────────┘  │
    │                     │                         │
    │                     │ Route traffic           │
    │                     ▼                         │
    │   ┌─────────────────────────────────────────┐│
    │   │  SINGLE POD (cdr-app)                   ││
    │   │  ┌───────────────────────────────────┐  ││
    │   │  │  Container                        │  ││
    │   │  │  Image: cdr-test-suite:v1         │  ││
    │   │  │  Port: 3000                       │  ││
    │   │  │  Resources:                       │  ││
    │   │  │    CPU: 500m - 1000m              │  ││
    │   │  │    Memory: 512Mi - 1Gi            │  ││
    │   │  │                                   │  ││
    │   │  │  ┌─────────────────────────────┐ │  ││
    │   │  │  │  React Frontend             │ │  ││
    │   │  │  │  - Material UI              │ │  ││
    │   │  │  │  - Vite Build               │ │  ││
    │   │  │  │  - Static Assets            │ │  ││
    │   │  │  └─────────────────────────────┘ │  ││
    │   │  │                                   │  ││
    │   │  │  ┌─────────────────────────────┐ │  ││
    │   │  │  │  Express.js Backend         │ │  ││
    │   │  │  │  - REST API Endpoints       │ │  ││
    │   │  │  │  - Job Management           │ │  ││
    │   │  │  │  - GitHub CSV Fetcher       │ │  ││
    │   │  │  │  - GCS Integration          │ │  ││
    │   │  │  └─────────────────────────────┘ │  ││
    │   │  │                                   │  ││
    │   │  │  Environment Variables:           │  ││
    │   │  │  • PORT=3000                     │  ││
    │   │  │  • NODE_ENV=production           │  ││
    │   │  │  • GCS_BUCKET_NAME               │  ││
    │   │  │  • GOOGLE_CLOUD_PROJECT          │  ││
    │   │  │                                   │  ││
    │   │  │  Volume Mounts:                   │  ││
    │   │  │  • /secrets/gcs/key.json         │  ││
    │   │  │                                   │  ││
    │   │  │  Health Checks:                   │  ││
    │   │  │  • Liveness: /api/health         │  ││
    │   │  │  • Readiness: /api/health        │  ││
    │   │  └───────────────────────────────────┘  ││
    │   └─────────────────────────────────────────┘│
    │                     │                         │
    └─────────────────────┼─────────────────────────┘
                          │
                          │ API Calls
                          ▼
            ┌──────────────────────────────┐
            │  Google Cloud Storage        │
            │  Bucket: {project}-cdr-jobs  │
            │                              │
            │  jobs/                       │
            │  ├── job-uuid-1/             │
            │  │   ├── status.json         │
            │  │   ├── metadata.json       │
            │  │   ├── input.csv           │
            │  │   ├── results.json        │
            │  │   └── output.csv          │
            │  └── job-uuid-2/             │
            │      └── ...                 │
            └──────────────────────────────┘
```

## Request Flow - User Submits CCDA Job

```
1. User fills form in browser
   ↓
2. POST request to http://EXTERNAL_IP/api/ccda-gen-test-cases
   ↓
3. Load Balancer receives on port 80
   ↓
4. Forwards to Kubernetes Service
   ↓
5. Service routes to single pod on port 3000
   ↓
6. Express backend handles request:
   • Validates input (Zod)
   • Fetches CSV from GitHub URL
   • Creates job_id
   • Writes status to GCS
   • Returns job_id INSTANTLY (5ms)
   ↓
7. Background processing (setImmediate):
   • Parse CSV
   • Generate test cases
   • Write results to GCS
   • Update status to "completed"
   ↓
8. Frontend polls GET /api/status/:jobId every 3 seconds
   ↓
9. When completed, fetch results
   ↓
10. Display in JsonResultViewer component
```

## Pod Lifecycle

```
┌─────────────────────────────────────────────────┐
│  Pod Creation                                    │
├─────────────────────────────────────────────────┤
│  1. Pull image from Artifact Registry            │
│  2. Create container                             │
│  3. Mount secrets volume                         │
│  4. Set environment variables                    │
│  5. Start Node.js process                        │
│  6. Wait 10s (initialDelaySeconds)              │
│  7. Run readiness probe → /api/health            │
│  8. If 200 OK → Mark pod Ready                   │
│  9. Add to Service load balancer                 │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  Pod Running                                     │
├─────────────────────────────────────────────────┤
│  • Liveness probe every 10 seconds              │
│  • Readiness probe every 5 seconds              │
│  • Serve HTTP requests on port 3000             │
│  • Process async jobs in background             │
│  • Write to GCS bucket                           │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  Pod Failure Scenarios                           │
├─────────────────────────────────────────────────┤
│  Liveness probe fails (3 consecutive times)     │
│  → Kubernetes KILLS pod                          │
│  → Creates new pod automatically                 │
│  → ~30 seconds downtime                          │
│                                                  │
│  Readiness probe fails                           │
│  → Pod removed from Service                      │
│  → No traffic sent to pod                        │
│  → Pod keeps running (not killed)                │
│  → Added back when probe succeeds                │
└─────────────────────────────────────────────────┘
```

## YAML Configuration Explained

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cdr-app          # Deployment name
spec:
  replicas: 1            # SINGLE POD (no HA)
  
  template:
    spec:
      containers:
      - name: cdr-app
        image: ...       # Docker image from Artifact Registry
        ports:
        - containerPort: 3000   # App listens on 3000
        
        env:
        - name: PORT
          value: "3000"         # Tell app to use port 3000
        
        resources:
          requests:              # Guaranteed minimum
            memory: "512Mi"
            cpu: "500m"          # 0.5 CPU cores
          limits:                # Maximum allowed
            memory: "1Gi"        # 1GB max
            cpu: "1000m"         # 1 CPU core max
        
        livenessProbe:           # Is pod alive?
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 30  # Wait 30s before first check
          periodSeconds: 10        # Check every 10s
        
        readinessProbe:          # Is pod ready for traffic?
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 10  # Start checking at 10s
          periodSeconds: 5         # Check every 5s
        
        volumeMounts:
        - name: gcs-credentials
          mountPath: /secrets/gcs   # GCS key at /secrets/gcs/key.json
      
      volumes:
      - name: gcs-credentials
        secret:
          secretName: gcs-credentials  # Kubernetes Secret
---
apiVersion: v1
kind: Service
metadata:
  name: cdr-app-service
spec:
  type: LoadBalancer      # Creates external IP
  selector:
    app: cdr-app          # Routes to pods with this label
  ports:
  - port: 80              # External port (users access)
    targetPort: 3000      # Container port (app listens)
```

## Single Pod vs Multi-Pod Comparison

```
┌─────────────────────────────────────────────────────┐
│  SINGLE POD (This Deployment)                       │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌────────────┐                                     │
│  │   Pod 1    │ ← All traffic                       │
│  │  Port 3000 │                                     │
│  └────────────┘                                     │
│                                                      │
│  ✅ Simple                                           │
│  ✅ Low cost (~$115/month)                          │
│  ✅ Easy to debug                                    │
│  ❌ Single point of failure                         │
│  ❌ Downtime during updates                         │
│  ❌ Can't handle high traffic                       │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  MULTI-POD (Production Deployment)                  │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐   │
│  │   Pod 1    │  │   Pod 2    │  │   Pod 3    │   │
│  │  Port 5000 │  │  Port 5000 │  │  Port 5000 │   │
│  └────────────┘  └────────────┘  └────────────┘   │
│       ↑               ↑               ↑            │
│       └───────────────┴───────────────┘            │
│           Load balanced traffic                    │
│                                                      │
│  ✅ High availability                               │
│  ✅ Zero-downtime updates                           │
│  ✅ Handles high traffic                            │
│  ✅ Auto-scaling (2-10 pods)                        │
│  ❌ More complex                                     │
│  ❌ Higher cost (~$130-180/month)                   │
└─────────────────────────────────────────────────────┘
```

## Kubernetes Components

```
┌──────────────────────────────────────────────────┐
│  Deployment (cdr-app)                             │
│  ↓                                                │
│  Manages ReplicaSet                               │
│  ↓                                                │
│  ReplicaSet ensures 1 pod running                 │
│  ↓                                                │
│  Pod (container running your app)                 │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│  Service (cdr-app-service)                        │
│  ↓                                                │
│  Finds pods with label "app: cdr-app"            │
│  ↓                                                │
│  Routes traffic to healthy pods                   │
│  ↓                                                │
│  Creates Google Cloud Load Balancer               │
│  ↓                                                │
│  Provisions external IP                           │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│  Secret (gcs-credentials)                         │
│  ↓                                                │
│  Stores GCS service account key (key.json)        │
│  ↓                                                │
│  Mounted into pod at /secrets/gcs/key.json       │
│  ↓                                                │
│  App uses for GCS authentication                  │
└──────────────────────────────────────────────────┘
```

## Networking

```
External Traffic Flow:
Internet → Load Balancer IP:80 → Service:80 → Pod:3000

Pod-to-GCS Flow:
Pod → GKE Node → GCP Network → Cloud Storage API

DNS Resolution (when using custom domain):
your-domain.com → DNS A Record → Load Balancer IP → Pod
```

## Resource Usage

```
Single Pod Resource Allocation:

┌─────────────────────────────────────┐
│  Kubernetes Node (e2-medium)        │
│  4 vCPUs, 16GB RAM                  │
│                                     │
│  ┌───────────────────────────────┐ │
│  │  System Pods (~2GB RAM)       │ │
│  └───────────────────────────────┘ │
│                                     │
│  ┌───────────────────────────────┐ │
│  │  CDR App Pod                  │ │
│  │  Guaranteed: 512Mi, 500m CPU  │ │
│  │  Maximum: 1Gi, 1000m CPU      │ │
│  │  Actual usage: ~400-600Mi     │ │
│  └───────────────────────────────┘ │
│                                     │
│  Available: ~13GB RAM, 3 vCPUs    │
│  (Can add more pods if needed)    │
└─────────────────────────────────────┘
```

## Summary

**This single-pod deployment provides:**

✅ **Simplicity** - One pod, easy to manage
✅ **Cost-effective** - Minimal resources for dev/test
✅ **Quick setup** - Deploy in 5 steps
✅ **GCS integration** - Job storage and retrieval
✅ **Health monitoring** - Automatic restart on failure

**Best for:**
- Development environments
- Testing and staging
- Low-traffic applications (<100 concurrent users)
- Proof of concept

**Not suitable for:**
- Production with SLA requirements
- High availability needs
- Traffic spikes
- Mission-critical applications

**When ready for production → Scale to 3 replicas with autoscaling**
