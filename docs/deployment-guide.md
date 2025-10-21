# CDR Test Quality Suite - Complete GKE Deployment Guide

## Table of Contents
1. [Prerequisites and Setup](#prerequisites-and-setup)
2. [Understanding Docker Containerization](#understanding-docker-containerization)
3. [Google Cloud Setup](#google-cloud-setup)
4. [Building and Pushing Docker Images](#building-and-pushing-docker-images)
5. [Creating the GKE Cluster](#creating-the-gke-cluster)
6. [Setting Up Storage and Secrets](#setting-up-storage-and-secrets)
7. [Deploying to Kubernetes](#deploying-to-kubernetes)
8. [Configuring Services and Networking](#configuring-services-and-networking)
9. [Setting Up Autoscaling](#setting-up-autoscaling)
10. [SSL/HTTPS Configuration](#ssl-https-configuration)
11. [Monitoring and Logging](#monitoring-and-logging)
12. [CI/CD Pipeline](#ci-cd-pipeline)
13. [Troubleshooting Guide](#troubleshooting-guide)

---

## Prerequisites and Setup

### 1.1 Install Google Cloud SDK

```bash
# Download and install from: https://cloud.google.com/sdk/docs/install
# Then initialize
gcloud init
gcloud auth login
```

**Why this is necessary:**
- The `gcloud` CLI is your primary interface to Google Cloud Platform
- It handles authentication, project management, and resource provisioning
- Authentication establishes your identity and permissions for all subsequent operations
- Initialization sets default configurations (project, region) to avoid repetitive flags

### 1.2 Install kubectl

```bash
gcloud components install kubectl
kubectl version --client
```

**Why this is necessary:**
- `kubectl` is the Kubernetes command-line tool for managing clusters
- It communicates with the Kubernetes API server to deploy and manage applications
- Installing via `gcloud components` ensures version compatibility with GKE
- Direct installation (vs. standalone) keeps your toolchain synchronized with GCP updates

### 1.3 Verify Docker Installation

```bash
docker --version
docker ps
```

**Why this is necessary:**
- Docker packages your application with all dependencies into a portable container
- Containers ensure your app runs identically in development, testing, and production
- Docker eliminates "it works on my machine" problems by creating reproducible environments
- Verification confirms you can build images locally before pushing to the cloud

---

## Understanding Docker Containerization

### 2.1 Why We Use Docker for This Application

**Problem without Docker:**
- Your application depends on specific Node.js version, npm packages, system libraries
- Different environments (development laptop, staging server, production GKE) may have different configurations
- Manual setup is error-prone and not reproducible
- Scaling requires reconfiguring each new server

**Solution with Docker:**
- Package application code + Node.js runtime + dependencies into a single image
- Image runs identically on any platform that supports Docker
- Kubernetes orchestrates these containers at scale
- Update by building a new image, not by manually configuring servers

### 2.2 Create Optimized Dockerfile

Create `Dockerfile` in project root:

```dockerfile
# Multi-stage build for production
# WHY: Separates build dependencies from runtime, reducing final image size by 60-70%
FROM node:20-alpine AS builder

# WHY: Alpine Linux is 5MB vs 300MB+ for full Ubuntu
# Smaller images = faster downloads, less attack surface, lower storage costs
WORKDIR /app

# Copy package files first
# WHY: Docker caches layers. If package.json unchanged, npm install is skipped
# This dramatically speeds up rebuilds during development
COPY package*.json ./

# Install ALL dependencies (including devDependencies for building)
# WHY: TypeScript compilation, Vite build tools are devDependencies
RUN npm ci

# WHY: npm ci is faster and more reliable than npm install
# - Uses package-lock.json for exact versions
# - Cleans node_modules before install (reproducible builds)
# - Fails if package.json and package-lock.json are out of sync

# Copy source code
COPY . .

# Build the application
# WHY: Compiles TypeScript, bundles frontend assets, optimizes for production
RUN npm run build

# Production stage
# WHY: Final image only contains runtime dependencies and built code
# Build tools (TypeScript, Vite) are left behind in builder stage
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ONLY production dependencies
# WHY: Excludes TypeScript, testing tools, dev servers
# Reduces image size by 40-50% and minimizes security vulnerabilities
RUN npm ci --only=production

# Copy built application from builder stage
# WHY: Only dist/ folder needed, not src/ with TypeScript files
COPY --from=builder /app/dist ./dist

# Create non-root user for security
# WHY: Running as root is a security risk
# If container is compromised, attacker has limited privileges
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose port 5000
# WHY: Documents which port the app listens on
# GKE uses this to route traffic to containers
EXPOSE 5000

# Health check
# WHY: Kubernetes needs to know if container is healthy
# Unhealthy containers are automatically restarted
# HTTP GET to /api/health must return 200 status
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start the application
CMD ["node", "dist/index.js"]
```

### 2.3 Create .dockerignore

```
node_modules
npm-debug.log
.git
.gitignore
.env
.env.local
dist
tmp
logs
*.log
.vscode
.idea
README.md
docs/
k8s/
```

**Why this is necessary:**
- Excludes files that don't belong in the container
- `node_modules` will be reinstalled via `npm ci` ensuring clean dependencies
- Secrets (`.env`) must never be in images - they're injected at runtime
- Reduces build context size = faster builds and uploads
- `.git` folder can be hundreds of MB and isn't needed in production

---

## Google Cloud Setup

### 3.1 Configure Project and Region

```bash
export PROJECT_ID="your-project-id"
export REGION="us-central1"
export CLUSTER_NAME="cdr-test-quality-cluster"

gcloud config set project $PROJECT_ID
gcloud config set compute/region $REGION
```

**Why we set these defaults:**
- Prevents accidentally creating resources in wrong project (costly mistake)
- Region selection affects latency, compliance, and costs
- `us-central1` is typically the cheapest region with all services available
- Environment variables make scripts reusable and reduce typing errors

### 3.2 Enable Required APIs

```bash
gcloud services enable container.googleapis.com
gcloud services enable artifactregistry.googleapis.com
gcloud services enable compute.googleapis.com
gcloud services enable storage.googleapis.com
```

**Why each API is needed:**

- **container.googleapis.com** (Kubernetes Engine API)
  - Creates and manages GKE clusters
  - Orchestrates containerized applications
  - Without this: Cannot create clusters

- **artifactregistry.googleapis.com** (Artifact Registry API)
  - Stores Docker images securely
  - Vulnerability scanning of images
  - Fine-grained access control
  - Replaces legacy Container Registry (GCR)

- **compute.googleapis.com** (Compute Engine API)
  - GKE runs on Compute Engine VMs under the hood
  - Manages load balancers, persistent disks, networking
  - Required for cluster node provisioning

- **storage.googleapis.com** (Cloud Storage API)
  - Your application uses GCS for async job storage
  - Stores job metadata, CSV files, test results
  - Provides atomic operations and high durability (99.999999999%)

---

## Building and Pushing Docker Images

### 4.1 Create Artifact Registry Repository

```bash
gcloud artifacts repositories create cdr-app-repo \
  --repository-format=docker \
  --location=$REGION \
  --description="CDR Test Quality Suite repository"
```

**Why Artifact Registry instead of Container Registry (GCR):**

| Feature | Artifact Registry | Container Registry (Legacy) |
|---------|------------------|----------------------------|
| **Security** | Vulnerability scanning included | Limited scanning |
| **Access Control** | Fine-grained IAM per repo | Project-level only |
| **Regional Storage** | Choose specific regions | Global or multi-region only |
| **Format Support** | Docker, Maven, npm, Python | Docker only |
| **Future-proof** | Actively developed | Being phased out |
| **Cost** | Pay for storage used | Higher storage costs |

**Why regional location:**
- Lower latency when GKE cluster is in same region
- Reduced data transfer costs (same region = free)
- Compliance requirements may mandate data locality

### 4.2 Configure Docker Authentication

```bash
gcloud auth configure-docker ${REGION}-docker.pkg.dev
```

**Why this is necessary:**
- Artifact Registry requires authentication to push/pull images
- Configures Docker to use your GCP credentials automatically
- Adds authentication helper to `~/.docker/config.json`
- Without this: `docker push` will fail with "unauthorized" error

### 4.3 Build and Tag Image

```bash
docker build -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/cdr-app-repo/cdr-test-suite:v1 .
```

**Why we tag with full registry path:**
- Format: `LOCATION-docker.pkg.dev/PROJECT_ID/REPOSITORY/IMAGE:TAG`
- Tag specifies where to push the image
- Enables multiple versions (v1, v2, latest) for rollback capability
- Semantic versioning helps track deployments

**What happens during build:**
1. Docker reads `Dockerfile` line by line
2. Each instruction creates a new layer (cached for speed)
3. Builder stage: Installs all dependencies, compiles TypeScript
4. Production stage: Copies only runtime files from builder
5. Final image: ~150MB vs 600MB+ without multi-stage build

### 4.4 Test Locally (Optional but Recommended)

```bash
docker run -p 5000:5000 -e PORT=5000 \
  ${REGION}-docker.pkg.dev/${PROJECT_ID}/cdr-app-repo/cdr-test-suite:v1
```

**Why you should test locally:**
- Catches configuration errors before expensive cloud deployments
- Verifies environment variables are set correctly
- Tests health check endpoints
- Confirms port binding works
- Debugging is much faster locally than in Kubernetes

### 4.5 Push to Artifact Registry

```bash
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/cdr-app-repo/cdr-test-suite:v1
```

**What happens during push:**
1. Docker uploads each layer to Artifact Registry
2. Layers already present (from previous pushes) are skipped
3. Artifact Registry scans for vulnerabilities automatically
4. Image is now available to GKE clusters in your project

**Why we push before creating cluster:**
- Cluster needs to pull this image when deploying
- Separates concerns: image building vs cluster operations
- Allows testing image on different clusters (dev, staging, prod)

---

## Creating the GKE Cluster

### 5.1 Understanding Cluster Options

**GKE Autopilot vs Standard:**

| Aspect | Autopilot (Recommended) | Standard |
|--------|------------------------|----------|
| **Node Management** | Google manages nodes | You manage nodes |
| **Scaling** | Automatic based on pods | Configure autoscaling |
| **Security** | Pre-configured best practices | You configure security |
| **Cost** | Pay only for pod resources | Pay for nodes (even if idle) |
| **Ops Overhead** | Minimal | High |
| **Use Case** | Most applications | Custom node configs needed |

### 5.2 Create Autopilot Cluster (Recommended)

```bash
gcloud container clusters create-auto $CLUSTER_NAME \
  --region=$REGION \
  --release-channel=regular
```

**Why each flag matters:**

- **`create-auto`**: Enables Autopilot mode
  - Google handles node provisioning, upgrades, security patches
  - Reduces operational burden by 80%
  - Prevents common misconfigurations

- **`--region=$REGION`**: Creates regional cluster
  - Deploys master and nodes across 3 zones (high availability)
  - If one zone fails, cluster remains operational
  - Costs 3x more than zonal but essential for production
  - Alternative `--zone` creates single-zone cluster (dev/test only)

- **`--release-channel=regular`**: Kubernetes version management
  - `rapid`: Latest features, less stable, frequent updates
  - `regular`: Balance of stability and new features (RECOMMENDED)
  - `stable`: Most stable, older versions, infrequent updates
  - Automatic upgrades prevent running unsupported Kubernetes versions

**What happens during cluster creation (5-10 minutes):**
1. Provisions master nodes (control plane) across 3 zones
2. Creates default node pool with initial nodes
3. Configures networking, firewalls, load balancers
4. Sets up IAM permissions for cluster service account
5. Installs core Kubernetes system components

### 5.3 Alternative: Create Standard Cluster (More Control)

```bash
gcloud container clusters create $CLUSTER_NAME \
  --region=$REGION \
  --num-nodes=1 \
  --machine-type=e2-standard-4 \
  --disk-size=50 \
  --enable-autoscaling \
  --min-nodes=1 \
  --max-nodes=5 \
  --enable-autorepair \
  --enable-autoupgrade \
  --release-channel=regular \
  --scopes=cloud-platform
```

**Why each flag matters:**

- **`--num-nodes=1`**: Nodes per zone
  - Regional cluster with 1 node/zone = 3 nodes total
  - Fewer nodes = lower cost, but less capacity
  - For production, 2-3 nodes/zone recommended

- **`--machine-type=e2-standard-4`**: VM instance type
  - e2-standard-4: 4 vCPUs, 16GB RAM
  - E2 series: Cost-optimized, good price/performance
  - Your app needs ~1GB RAM per pod, so 16GB = ~12 pods per node
  - Alternatives: n2-standard-4 (more performance), e2-medium (cheaper for dev)

- **`--disk-size=50`**: Boot disk size in GB
  - Holds container images, logs, system files
  - 50GB is sufficient for most apps
  - Larger images or many pods may need 100GB+
  - Cannot be reduced later, only increased

- **`--enable-autoscaling --min-nodes=1 --max-nodes=5`**: Cluster autoscaler
  - Automatically adds nodes when pods can't be scheduled
  - Removes nodes when pods fit on fewer nodes
  - Min nodes: Always have capacity for essential pods
  - Max nodes: Prevents runaway costs from misconfigured autoscaling

- **`--enable-autorepair`**: Node auto-repair
  - Monitors node health continuously
  - Unhealthy nodes are automatically drained and recreated
  - Reduces manual intervention for hardware failures

- **`--enable-autoupgrade`**: Node auto-upgrade
  - Keeps nodes updated with latest security patches
  - Prevents running outdated Kubernetes versions (security risk)
  - Upgrades happen during maintenance windows

- **`--scopes=cloud-platform`**: OAuth scopes
  - Grants nodes access to all GCP APIs
  - Required for pulling images from Artifact Registry
  - Enables logging to Cloud Logging, metrics to Cloud Monitoring
  - Alternative: Use Workload Identity for more granular control

### 5.4 Get Cluster Credentials

```bash
gcloud container clusters get-credentials $CLUSTER_NAME --region=$REGION
```

**Why this is necessary:**
- Downloads cluster certificate and API endpoint to `~/.kube/config`
- Configures `kubectl` to communicate with your specific cluster
- Sets up authentication so kubectl commands work
- Without this: `kubectl get nodes` fails with connection error

### 5.5 Verify Cluster

```bash
kubectl cluster-info
kubectl get nodes
kubectl get namespaces
```

**What you're checking:**
- **cluster-info**: Master API endpoint, DNS service running
- **get nodes**: All nodes are Ready (not NotReady or Unknown)
- **get namespaces**: Default Kubernetes namespaces exist

**Expected output:**
```
NAME                                       STATUS   ROLES    AGE
gke-cluster-default-pool-abc123-xyz       Ready    <none>   5m
gke-cluster-default-pool-def456-uvw       Ready    <none>   5m
gke-cluster-default-pool-ghi789-rst       Ready    <none>   5m
```

---

## Setting Up Storage and Secrets

### 6.1 Create Google Cloud Storage Bucket

```bash
export BUCKET_NAME="${PROJECT_ID}-cdr-jobs"

gcloud storage buckets create gs://${BUCKET_NAME} \
  --location=$REGION \
  --uniform-bucket-level-access
```

**Why each configuration matters:**

- **Bucket naming**: `${PROJECT_ID}-cdr-jobs`
  - Must be globally unique across all GCP projects
  - Including project ID prevents collisions
  - Descriptive name shows purpose

- **`--location=$REGION`**: Same region as cluster
  - Zero egress costs when GKE accesses GCS in same region
  - Lower latency for job status updates
  - Compliance: Data stays in specific geographic region

- **`--uniform-bucket-level-access`**: Security model
  - All objects inherit bucket-level IAM permissions
  - Simpler access control vs per-object ACLs
  - Recommended by Google for new buckets
  - Prevents accidentally public objects

**What this bucket stores:**
```
gs://{project}-cdr-jobs/
├── jobs/
│   ├── job-uuid-1/
│   │   ├── status.json       # Current job status
│   │   ├── metadata.json     # Job creation info
│   │   ├── input.csv         # Original CSV mapping
│   │   ├── results.json      # Generated test cases
│   │   └── output.csv        # Zephyr-compatible CSV
│   └── job-uuid-2/
│       └── ...
```

### 6.2 Create Service Account for GCS Access

```bash
gcloud iam service-accounts create cdr-gcs-sa \
  --display-name="CDR GCS Service Account"
```

**Why a dedicated service account:**
- Principle of least privilege: Only has GCS permissions, nothing else
- Separate credentials from your personal account
- Can be revoked without affecting other services
- Audit trail: Actions attributed to service account, not individual users
- Enables secure credential rotation

### 6.3 Grant Storage Permissions

```bash
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:cdr-gcs-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/storage.admin"
```

**Why Storage Admin role:**
- Allows reading, writing, deleting objects in all buckets
- Needed for job lifecycle: create → update → read → cleanup
- Alternative roles:
  - `storage.objectCreator`: Only write (insufficient)
  - `storage.objectViewer`: Only read (insufficient)
  - `storage.admin`: Full control (what we need)

**Security note:**
- In production, consider `storage.objectAdmin` scoped to specific bucket
- Prevents access to unrelated buckets in your project

### 6.4 Create and Download Service Account Key

```bash
gcloud iam service-accounts keys create gcs-key.json \
  --iam-account=cdr-gcs-sa@${PROJECT_ID}.iam.gserviceaccount.com
```

**Why we create a key file:**
- JSON key allows applications to authenticate as service account
- Contains private key + service account email
- Used by Node.js app to access GCS APIs
- Enables authentication without user interaction

**Security critical:**
- ⚠️ **NEVER commit this file to Git**
- Store securely - anyone with this file can access your GCS
- Rotate keys every 90 days
- Consider Workload Identity (keyless) for production

### 6.5 Create Kubernetes Secrets

```bash
# GCS credentials secret
kubectl create secret generic gcs-credentials \
  --from-file=key.json=gcs-key.json

# Environment variables secret
kubectl create secret generic cdr-env-secrets \
  --from-literal=NODE_ENV=production \
  --from-literal=GCS_BUCKET_NAME=$BUCKET_NAME

# API keys secret
kubectl create secret generic api-keys \
  --from-literal=GOOGLE_CLOUD_PROJECT=$PROJECT_ID
```

**Why Kubernetes Secrets:**

- **Separation of code and configuration**
  - Secrets are stored separately from container images
  - Same image works in dev/staging/prod with different secrets
  - Change secrets without rebuilding images

- **Encryption at rest**
  - Secrets encrypted in etcd (Kubernetes database)
  - GKE automatically encrypts secrets using Google-managed keys
  - More secure than environment variables in Dockerfile

- **Access control**
  - Only pods in same namespace can access secrets
  - RBAC controls which service accounts can read secrets
  - Prevents accidental exposure

- **Injection methods**
  - Volume mounts: Secret appears as file in container
  - Environment variables: Secret value in env var
  - We use both for flexibility

**How secrets are used in pods:**
```yaml
# Volume mount (for JSON key file)
volumeMounts:
- name: gcs-credentials
  mountPath: /secrets/gcs
  readOnly: true

# Environment variable (for config)
env:
- name: GCS_BUCKET_NAME
  valueFrom:
    secretKeyRef:
      name: cdr-env-secrets
      key: GCS_BUCKET_NAME
```

---

## Deploying to Kubernetes

### 7.1 Create Deployment Manifest

Create `k8s/deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cdr-test-suite
  labels:
    app: cdr-test-suite
spec:
  replicas: 3
  selector:
    matchLabels:
      app: cdr-test-suite
  template:
    metadata:
      labels:
        app: cdr-test-suite
    spec:
      containers:
      - name: cdr-app
        image: us-central1-docker.pkg.dev/YOUR_PROJECT_ID/cdr-app-repo/cdr-test-suite:v1
        ports:
        - containerPort: 5000
          name: http
        env:
        - name: PORT
          value: "5000"
        - name: NODE_ENV
          value: "production"
        - name: GCS_BUCKET_NAME
          valueFrom:
            secretKeyRef:
              name: cdr-env-secrets
              key: GCS_BUCKET_NAME
        - name: GOOGLE_APPLICATION_CREDENTIALS
          value: /secrets/gcs/key.json
        - name: GOOGLE_CLOUD_PROJECT
          valueFrom:
            secretKeyRef:
              name: api-keys
              key: GOOGLE_CLOUD_PROJECT
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /api/health
            port: 5000
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
        readinessProbe:
          httpGet:
            path: /api/health
            port: 5000
          initialDelaySeconds: 10
          periodSeconds: 5
          timeoutSeconds: 3
        volumeMounts:
        - name: gcs-credentials
          mountPath: /secrets/gcs
          readOnly: true
      volumes:
      - name: gcs-credentials
        secret:
          secretName: gcs-credentials
```

**Why each field matters:**

#### Deployment Configuration

- **`replicas: 3`**: Number of pod copies
  - High availability: If one pod crashes, two others handle traffic
  - Load distribution: Requests spread across 3 pods
  - Rolling updates: Update one pod at a time without downtime
  - For production: 3 replicas minimum (one per zone in regional cluster)

- **`selector.matchLabels`**: Pod selection
  - Deployment manages all pods with `app: cdr-test-suite` label
  - Enables finding pods for updates, scaling, deletion
  - Must match `template.metadata.labels`

#### Container Configuration

- **`image`**: Full path to Docker image
  - Must match exactly what you pushed to Artifact Registry
  - Kubernetes pulls this image to each node
  - Use specific version tag (v1) not "latest" for reproducibility

- **`ports.containerPort: 5000`**: 
  - Your Express app listens on port 5000
  - Kubernetes uses this to route traffic to container
  - Must match the PORT environment variable

#### Resource Limits - Critical for Stability

```yaml
resources:
  requests:
    memory: "512Mi"    # Guaranteed allocation
    cpu: "500m"        # 0.5 CPU cores guaranteed
  limits:
    memory: "1Gi"      # Maximum allowed
    cpu: "1000m"       # 1 CPU core maximum
```

**Why resource management is critical:**

- **Requests** (minimum guaranteed):
  - Kubernetes won't schedule pod if node can't guarantee this
  - Used by scheduler to place pods on appropriate nodes
  - Prevents overcommitting resources
  - 512Mi RAM: Your app uses ~300-400Mi, leaves headroom for spikes

- **Limits** (maximum allowed):
  - Pod can't exceed these values
  - Exceeding memory limit = pod killed (OOMKilled)
  - Exceeding CPU limit = throttled (slowed down)
  - Prevents runaway processes from consuming all node resources

- **Why we set limits 2x requests:**
  - Allows handling traffic spikes without running out of resources
  - Prevents one pod from starving others
  - Balance between efficiency and safety

**How Kubernetes uses these:**
1. Pod requests 512Mi RAM
2. Scheduler finds node with >= 512Mi available
3. Pod placed on that node
4. Cgroup limits set to 1Gi (can't exceed)
5. If pod tries to use 1.1Gi → killed and restarted

#### Health Checks - Ensuring Reliability

**Liveness Probe:**
```yaml
livenessProbe:
  httpGet:
    path: /api/health
    port: 5000
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
```

**What it does:**
- Checks if application is alive and responding
- HTTP GET to `/api/health` every 10 seconds
- If 3 consecutive failures → pod is killed and recreated
- `initialDelaySeconds: 30`: Wait 30s after start before first check (app needs time to initialize)

**Why this is critical:**
- Detects deadlocks, infinite loops, crashed processes
- Automatic recovery without manual intervention
- Your `/api/health` endpoint should return 200 if app is healthy

**Readiness Probe:**
```yaml
readinessProbe:
  httpGet:
    path: /api/health
    port: 5000
  initialDelaySeconds: 10
  periodSeconds: 5
  timeoutSeconds: 3
```

**What it does:**
- Checks if pod is ready to accept traffic
- HTTP GET to `/api/health` every 5 seconds
- If fails → pod removed from service load balancer (no traffic sent)
- If succeeds → pod added back to load balancer

**Why separate from liveness:**
- During deployment, new pods need time to warm up
- Database connections, cache warming, initialization
- Liveness = "is it alive?", Readiness = "is it ready for users?"
- Prevents sending traffic to pods that aren't ready

**Example scenario:**
1. New pod starts during rolling update
2. Liveness probe waits 30s before checking
3. Readiness probe starts checking at 10s
4. Pod initializing, returns 503 Service Unavailable
5. Readiness probe fails → no traffic sent to this pod
6. After 15s, app fully initialized, returns 200 OK
7. Readiness probe succeeds → traffic now routed to pod
8. Pod serves requests successfully

#### Volume Mounts - Secrets Access

```yaml
volumeMounts:
- name: gcs-credentials
  mountPath: /secrets/gcs
  readOnly: true

volumes:
- name: gcs-credentials
  secret:
    secretName: gcs-credentials
```

**Why this pattern:**
- Secret `gcs-credentials` contains `key.json` file
- Mounted at `/secrets/gcs/key.json` in container
- Your app reads: `process.env.GOOGLE_APPLICATION_CREDENTIALS = "/secrets/gcs/key.json"`
- Google Cloud SDK automatically uses this file for authentication
- `readOnly: true`: Prevents accidental modification

### 7.2 Create Service Manifest

Add to `k8s/deployment.yaml`:

```yaml
---
apiVersion: v1
kind: Service
metadata:
  name: cdr-test-suite-service
  labels:
    app: cdr-test-suite
spec:
  type: LoadBalancer
  selector:
    app: cdr-test-suite
  ports:
  - protocol: TCP
    port: 80
    targetPort: 5000
    name: http
```

**Why each field matters:**

- **`type: LoadBalancer`**: Service type
  - Creates Google Cloud Load Balancer automatically
  - Provisions external IP address accessible from internet
  - Distributes traffic across all healthy pods
  - Alternative types:
    - `ClusterIP`: Internal only (default, no external access)
    - `NodePort`: Exposes on each node's IP (not recommended for production)
    - `LoadBalancer`: External access with load balancing (what we need)

- **`selector: app: cdr-test-suite`**: Pod selection
  - Service sends traffic to pods with this label
  - Matches the labels in Deployment
  - As pods scale up/down, service automatically discovers them

- **`port: 80`**: External port
  - Users access your app via `http://<EXTERNAL_IP>:80`
  - Port 80 is standard HTTP (users don't need to specify port)
  - For HTTPS, use port 443

- **`targetPort: 5000`**: Container port
  - Traffic received on port 80 is forwarded to port 5000 on pods
  - Matches `containerPort` in Deployment
  - Allows external port (80) different from container port (5000)

**How traffic flows:**
```
User → http://EXTERNAL_IP:80
    → Google Cloud Load Balancer
    → Kubernetes Service (cdr-test-suite-service)
    → Pod 1 :5000 (33% of traffic)
    → Pod 2 :5000 (33% of traffic)
    → Pod 3 :5000 (34% of traffic)
```

### 7.3 Deploy to GKE

```bash
# Replace PROJECT_ID placeholder
sed -i "s/YOUR_PROJECT_ID/${PROJECT_ID}/g" k8s/deployment.yaml

# Apply configuration
kubectl apply -f k8s/deployment.yaml
```

**What `kubectl apply` does:**
1. Reads YAML file(s)
2. Compares desired state (YAML) with current state (cluster)
3. Calculates minimum changes needed
4. Applies changes via Kubernetes API
5. Watches for completion

**Why `apply` instead of `create`:**
- `create`: Fails if resource already exists
- `apply`: Creates if missing, updates if exists (idempotent)
- Safe to run multiple times
- Supports declarative configuration

### 7.4 Monitor Deployment

```bash
# Watch deployment progress
kubectl get deployments --watch

# Check pod status
kubectl get pods

# Detailed pod information
kubectl describe pod <pod-name>

# View logs from all pods
kubectl logs -l app=cdr-test-suite --tail=50 -f
```

**What to look for:**

**Deployment status:**
```
NAME              READY   UP-TO-DATE   AVAILABLE   AGE
cdr-test-suite    3/3     3            3           2m
```
- `READY 3/3`: All 3 replicas are running and healthy
- `UP-TO-DATE 3`: All pods are running latest version
- `AVAILABLE 3`: All pods passed readiness probe

**Pod status:**
```
NAME                              READY   STATUS    RESTARTS   AGE
cdr-test-suite-abc123-xyz         1/1     Running   0          2m
cdr-test-suite-def456-uvw         1/1     Running   0          2m
cdr-test-suite-ghi789-rst         1/1     Running   0          2m
```
- `STATUS: Running`: Pod is active
- `READY 1/1`: Container is running and passed readiness probe
- `RESTARTS 0`: Pod hasn't crashed

**Common failure states:**
- `ImagePullBackOff`: Can't pull image (check image name, authentication)
- `CrashLoopBackOff`: Pod starts then crashes repeatedly (check logs)
- `Pending`: Can't schedule (insufficient resources or node issues)
- `Error`: Container exited with non-zero code

### 7.5 Get External IP

```bash
kubectl get service cdr-test-suite-service --watch
```

**What's happening:**
```
NAME                      TYPE           EXTERNAL-IP     PORT(S)        AGE
cdr-test-suite-service   LoadBalancer   <pending>       80:32456/TCP   30s
cdr-test-suite-service   LoadBalancer   35.123.45.67    80:32456/TCP   2m
```

- First: `<pending>` - Google Cloud is provisioning load balancer
- After 2-5 minutes: External IP appears
- This IP is stable - won't change unless you delete service

**Why it takes time:**
- GCP creates Cloud Load Balancer infrastructure
- Configures health checks
- Sets up forwarding rules
- Provisions external IP from Google's pool

### 7.6 Test Application

```bash
export EXTERNAL_IP=$(kubectl get service cdr-test-suite-service \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

echo "Application URL: http://${EXTERNAL_IP}"

# Test health endpoint
curl http://${EXTERNAL_IP}/api/health

# Expected response: {"status":"ok"} or similar
```

**What to test:**
1. Health endpoint returns 200 OK
2. Frontend loads in browser
3. Can upload CSV files
4. Can submit CCDA jobs
5. Job status polling works
6. Can download results

---

## Setting Up Autoscaling

### 8.1 Horizontal Pod Autoscaler (HPA)

```bash
kubectl autoscale deployment cdr-test-suite \
  --cpu-percent=70 \
  --min=2 \
  --max=10
```

**Why autoscaling is essential:**

**Without autoscaling:**
- Fixed 3 replicas always running
- Low traffic (night): Wasting resources and money
- High traffic (peak hours): Slow response times, potential downtime
- Manual scaling is slow and requires human intervention

**With autoscaling:**
- Automatically adjusts replicas based on load
- Low traffic: Scales down to 2 pods (saves cost)
- High traffic: Scales up to 10 pods (maintains performance)
- Responds in minutes, not hours

**How it works:**
1. HPA checks CPU usage every 15 seconds
2. Calculates average CPU across all pods
3. If average > 70%: Scale up (add pods)
4. If average < 70%: Scale down (remove pods)
5. Respects min (2) and max (10) limits

**Why `--cpu-percent=70`:**
- 70% is sweet spot: Pods have capacity for spikes
- Too low (30%): Scales up unnecessarily, costly
- Too high (90%): Pods overloaded before scaling, slow response
- Leaves 30% headroom for sudden traffic bursts

**Why `--min=2`:**
- Always have 2 pods minimum (high availability)
- If one pod crashes, second handles traffic
- Faster scale-up (already have 2 pods running)
- Even at 2am, service is available

**Why `--max=10`:**
- Prevents runaway scaling from attacks or bugs
- Cost control: 10 pods = predictable maximum cost
- Cluster capacity: Ensure cluster can fit 10 pods
- Adjust based on traffic patterns (e-commerce may need 50+ during Black Friday)

### 8.2 Verify HPA

```bash
kubectl get hpa

# Watch HPA in action
kubectl get hpa --watch
```

**Expected output:**
```
NAME             REFERENCE                   TARGETS   MINPODS   MAXPODS   REPLICAS   AGE
cdr-test-suite   Deployment/cdr-test-suite   45%/70%   2         10        3          1m
```

- `TARGETS 45%/70%`: Current CPU usage 45%, target 70%
- `REPLICAS 3`: Currently running 3 pods
- If CPU goes to 75%: Scales up to 4-5 pods
- If CPU drops to 20%: Scales down to 2 pods (minimum)

### 8.3 Load Test to Verify Autoscaling

```bash
# Install load testing tool
kubectl run -i --tty load-generator --rm --image=busybox --restart=Never -- /bin/sh

# Inside pod, generate load
while true; do wget -q -O- http://cdr-test-suite-service/api/health; done
```

**What to observe:**
1. CPU usage increases on pods
2. After ~2 minutes, HPA scales up
3. New pods start and become Ready
4. Load distributed across more pods
5. CPU usage per pod decreases
6. Stop load test → HPA scales down after 5 minutes

**Why scale-down is slower:**
- Prevents flapping (rapid up/down scaling)
- Gives traffic time to stabilize
- 5-minute cooldown period after scale-up

---

## SSL/HTTPS Configuration

### 9.1 Reserve Static IP Address

```bash
gcloud compute addresses create cdr-static-ip --global
gcloud compute addresses describe cdr-static-ip --global
```

**Why static IP:**
- Load Balancer IP changes if service is deleted
- Static IP persists even if you recreate service
- Required for DNS mapping (yourdomain.com → IP)
- Needed for SSL certificate validation

### 9.2 Create Ingress with Managed Certificate

Create `k8s/ingress.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: cdr-ingress
  annotations:
    kubernetes.io/ingress.class: "gce"
    networking.gke.io/managed-certificates: "cdr-ssl-cert"
    kubernetes.io/ingress.global-static-ip-name: "cdr-static-ip"
spec:
  rules:
  - host: your-domain.com
    http:
      paths:
      - path: /*
        pathType: ImplementationSpecific
        backend:
          service:
            name: cdr-test-suite-service
            port:
              number: 80
---
apiVersion: networking.gke.io/v1
kind: ManagedCertificate
metadata:
  name: cdr-ssl-cert
spec:
  domains:
    - your-domain.com
```

**Why Ingress instead of LoadBalancer service:**

| Feature | LoadBalancer Service | Ingress |
|---------|---------------------|---------|
| **HTTP/HTTPS** | Manual cert management | Automatic SSL certificates |
| **Multiple services** | One IP per service | One IP for many services |
| **Path routing** | No | Yes (`/api` → service A, `/admin` → service B) |
| **Cost** | $0.025/hour per LB | $0.025/hour for all services |
| **SSL termination** | Manual | Automatic with Google-managed certs |

**Why Managed Certificates:**
- Google provisions and renews SSL certificates automatically
- Free (vs $50-300/year for purchased certificates)
- Auto-renewal every 90 days (Let's Encrypt under the hood)
- No manual certificate management
- Just specify domain, Google handles the rest

**How it works:**
1. You create ManagedCertificate resource
2. Point your domain DNS to the static IP
3. Google verifies you own the domain (HTTP challenge)
4. Google provisions SSL certificate
5. Certificate automatically renewed before expiration

**Setup steps:**
```bash
# Apply ingress
kubectl apply -f k8s/ingress.yaml

# Update DNS records
# Add A record: your-domain.com → YOUR_STATIC_IP

# Wait for certificate provisioning (10-60 minutes)
kubectl describe managedcertificate cdr-ssl-cert
```

**Certificate status:**
```
Status:
  Certificate Name:    mcrt-abc123-cdr-ssl-cert
  Certificate Status:  Provisioning  # Initial state
  Certificate Status:  Active        # Ready after DNS propagates
  Domain Status:
    Domain:     your-domain.com
    Status:     Active
```

**Why it takes time:**
- DNS propagation (5-30 minutes)
- Domain verification via HTTP challenge
- Certificate issuance from Let's Encrypt
- Certificate deployment to load balancers

---

## Monitoring and Logging

### 10.1 View Application Logs

```bash
# Logs from all pods with label
kubectl logs -l app=cdr-test-suite --tail=100 -f

# Logs from specific pod
kubectl logs cdr-test-suite-abc123-xyz -f

# Previous pod logs (if crashed)
kubectl logs cdr-test-suite-abc123-xyz --previous
```

**Why logging is critical:**
- Debug production issues
- Monitor application behavior
- Security auditing (who did what when)
- Performance analysis
- Compliance requirements

**Best practices:**
- Structured logging (JSON format)
- Include request IDs for tracing
- Log errors with stack traces
- Avoid logging secrets or PII

### 10.2 Google Cloud Logging (Formerly Stackdriver)

**Automatic integration:**
- GKE automatically sends logs to Cloud Logging
- No configuration needed
- Logs retained for 30 days (default)
- Searchable, filterable interface

**Access logs:**
1. Go to Google Cloud Console
2. Navigate to "Logging" → "Logs Explorer"
3. Filter: `resource.type="k8s_container"` and `resource.labels.cluster_name="cdr-test-quality-cluster"`

**Why Cloud Logging:**
- Centralized: All logs in one place
- Persistent: Logs survive pod restarts
- Powerful search: Filter by severity, timestamp, message content
- Alerting: Set up alerts on error patterns
- Export: Send logs to BigQuery for analysis

### 10.3 Monitoring with Cloud Monitoring

**Key metrics to monitor:**
- **Pod metrics**: CPU, memory, network, disk
- **Node metrics**: Resource utilization, health
- **Application metrics**: Request rate, latency, errors
- **GCS metrics**: Bucket operations, bandwidth

**Set up monitoring:**
```bash
# View pod resource usage
kubectl top pods

# View node resource usage
kubectl top nodes
```

**Cloud Console dashboards:**
1. Go to "Monitoring" → "Dashboards"
2. Select "GKE" dashboard
3. View cluster, namespace, pod metrics

**Create custom alerts:**
- Alert if pod CPU > 80% for 5 minutes
- Alert if pod crashes more than 3 times in 10 minutes
- Alert if HTTP 5xx errors > 1% of requests
- Alert if GCS bucket size > 100GB

### 10.4 Health Checks and Uptime Monitoring

**Internal health checks:**
- Liveness probe: Pod is alive
- Readiness probe: Pod is ready for traffic
- Both hit `/api/health` endpoint

**External uptime monitoring:**
- Use Google Cloud Monitoring uptime checks
- Pings your external IP every minute
- Alerts if endpoint unreachable
- Measures latency from different regions

**Set up uptime check:**
1. Go to "Monitoring" → "Uptime checks"
2. Create check for `http://YOUR_DOMAIN/api/health`
3. Set check interval: 1 minute
4. Set alert: Email if down for 2 consecutive checks

---

## CI/CD Pipeline

### 11.1 Why CI/CD is Essential

**Without CI/CD:**
- Manual builds: `docker build`, `docker push`
- Manual deployments: `kubectl apply`
- Error-prone (typos, wrong version tags)
- No testing before production
- Slow (takes developer time)

**With CI/CD:**
- Automated on every commit
- Tests run automatically
- Builds happen in cloud
- Zero-downtime deployments
- Rollback on failure
- Audit trail of all changes

### 11.2 GitHub Actions Pipeline

Create `.github/workflows/deploy-gke.yml`:

```yaml
name: Deploy to GKE

on:
  push:
    branches:
      - main

env:
  PROJECT_ID: ${{ secrets.GCP_PROJECT_ID }}
  GKE_CLUSTER: cdr-test-quality-cluster
  GKE_REGION: us-central1
  IMAGE: cdr-test-suite

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v3

    - name: Authenticate to Google Cloud
      uses: google-github-actions/auth@v1
      with:
        credentials_json: ${{ secrets.GCP_SA_KEY }}

    - name: Set up Cloud SDK
      uses: google-github-actions/setup-gcloud@v1

    - name: Configure Docker for Artifact Registry
      run: gcloud auth configure-docker us-central1-docker.pkg.dev

    - name: Build Docker image
      run: |
        docker build -t us-central1-docker.pkg.dev/$PROJECT_ID/cdr-app-repo/$IMAGE:$GITHUB_SHA .
        docker build -t us-central1-docker.pkg.dev/$PROJECT_ID/cdr-app-repo/$IMAGE:latest .

    - name: Push Docker image
      run: |
        docker push us-central1-docker.pkg.dev/$PROJECT_ID/cdr-app-repo/$IMAGE:$GITHUB_SHA
        docker push us-central1-docker.pkg.dev/$PROJECT_ID/cdr-app-repo/$IMAGE:latest

    - name: Get GKE credentials
      run: |
        gcloud container clusters get-credentials $GKE_CLUSTER --region $GKE_REGION

    - name: Deploy to GKE
      run: |
        kubectl set image deployment/cdr-test-suite \
          cdr-app=us-central1-docker.pkg.dev/$PROJECT_ID/cdr-app-repo/$IMAGE:$GITHUB_SHA
        kubectl rollout status deployment/cdr-test-suite
```

**Why each step matters:**

1. **Trigger on `push` to `main`**:
   - Every commit to main branch triggers deployment
   - Ensures production always matches main branch
   - Alternative: Manual trigger with `workflow_dispatch`

2. **Use `$GITHUB_SHA` for image tags**:
   - Git commit hash uniquely identifies this version
   - Enables exact version tracking
   - Rollback to any previous commit
   - Avoids "latest" tag ambiguity

3. **Authenticate with service account**:
   - GitHub Actions needs GCP credentials
   - Create service account with GKE/Artifact Registry permissions
   - Download JSON key → Add as GitHub secret `GCP_SA_KEY`
   - Never commit credentials to repository

4. **Build and push in CI**:
   - Consistent build environment (not developer's laptop)
   - Faster (GitHub-hosted runners have fast internet)
   - No "works on my machine" issues

5. **Rolling deployment**:
   - `kubectl set image`: Updates deployment with new image
   - `kubectl rollout status`: Waits until deployment succeeds
   - Fails if health checks don't pass
   - Automatic rollback on failure

**Required GitHub Secrets:**
```
GCP_PROJECT_ID: your-project-id
GCP_SA_KEY: { ...service account JSON... }
```

### 11.3 Deployment Strategy: Rolling Update

**How rolling updates work:**

```
Initial state: 3 pods running v1
1. Create 1 new pod with v2
2. Wait for v2 pod to pass readiness probe
3. Terminate 1 old v1 pod
4. Create another v2 pod
5. Wait for readiness
6. Terminate another v1 pod
7. Repeat until all pods are v2
```

**Zero-downtime deployment:**
- At least 2 pods always running
- Old pods serve traffic until new pods ready
- If new version fails health checks, rollout stops
- Old version continues serving traffic

**Configure rollout speed:**
```yaml
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1         # Max 1 extra pod during update
      maxUnavailable: 0   # At least 3 pods always running
```

### 11.4 Rollback Strategy

**Automatic rollback:**
```bash
# If new version fails, rollback to previous
kubectl rollout undo deployment/cdr-test-suite

# Rollback to specific revision
kubectl rollout history deployment/cdr-test-suite
kubectl rollout undo deployment/cdr-test-suite --to-revision=2
```

**Why rollback capability is critical:**
- New version may have bugs not caught in testing
- Database migrations may fail
- Third-party API changes
- Human error in configuration

**Kubernetes tracks revision history:**
```bash
kubectl rollout history deployment/cdr-test-suite

# Output:
REVISION  CHANGE-CAUSE
1         Initial deployment
2         Updated to use GCS for job storage
3         Added FastAPI integration
4         Updated resource limits
```

---

## Troubleshooting Guide

### 12.1 Pods Not Starting

**Symptom:** Pods stuck in `Pending` or `ContainerCreating`

**Check 1: Node resources**
```bash
kubectl describe pod <pod-name>

# Look for:
# Events: 0/3 nodes are available: insufficient memory
```

**Solution:**
- Reduce resource requests
- Add more nodes to cluster
- Enable cluster autoscaler

**Check 2: Image pull errors**
```bash
kubectl describe pod <pod-name>

# Look for:
# Events: Failed to pull image: unauthorized
```

**Solution:**
- Verify image name is correct
- Check Artifact Registry permissions
- Ensure service account has `artifactregistry.reader` role

**Check 3: Volume mount errors**
```bash
kubectl describe pod <pod-name>

# Look for:
# Events: MountVolume.SetUp failed: secret "gcs-credentials" not found
```

**Solution:**
```bash
# Verify secret exists
kubectl get secrets

# Recreate if missing
kubectl create secret generic gcs-credentials --from-file=key.json=gcs-key.json
```

### 12.2 Pods Crashing (CrashLoopBackOff)

**Symptom:** Pods start then immediately crash

**Check logs:**
```bash
kubectl logs <pod-name>
kubectl logs <pod-name> --previous
```

**Common causes:**

1. **Missing environment variables**
   ```
   Error: GOOGLE_APPLICATION_CREDENTIALS is not set
   ```
   Solution: Check secrets are mounted correctly

2. **Port binding issues**
   ```
   Error: EADDRINUSE: address already in use :::5000
   ```
   Solution: Verify only one process listens on port 5000

3. **Database connection failures**
   ```
   Error: Connection refused to postgresql://...
   ```
   Solution: Check database credentials, network policies

4. **Application code errors**
   ```
   TypeError: Cannot read property 'x' of undefined
   ```
   Solution: Fix code, deploy new version

### 12.3 Service Has No External IP

**Symptom:** `kubectl get service` shows `<pending>` for external IP

**Check 1: Service type**
```bash
kubectl describe service cdr-test-suite-service

# Look for:
# Type: LoadBalancer  (not ClusterIP or NodePort)
```

**Check 2: GCP quotas**
- GCP limits load balancers per project
- Check Cloud Console → IAM & Admin → Quotas
- Request quota increase if needed

**Check 3: Firewall rules**
```bash
gcloud compute firewall-rules list
```

**Solution:**
```bash
# Delete and recreate service
kubectl delete service cdr-test-suite-service
kubectl apply -f k8s/deployment.yaml
```

### 12.4 High Latency / Slow Performance

**Diagnose:**
```bash
# Check pod CPU/memory
kubectl top pods

# Check node CPU/memory
kubectl top nodes

# Check HPA status
kubectl get hpa
```

**Common causes:**

1. **CPU throttling:**
   - Pods hitting CPU limits
   - Solution: Increase CPU limits or add more replicas

2. **Insufficient replicas:**
   - All pods at 90%+ CPU
   - Solution: Lower HPA target (scale up sooner)

3. **Slow GCS operations:**
   - Cross-region requests
   - Solution: Ensure bucket in same region as cluster

4. **Database connection pool exhausted:**
   - Too few connections for traffic
   - Solution: Increase connection pool size

### 12.5 SSL Certificate Not Provisioning

**Symptom:** ManagedCertificate stuck in "Provisioning"

**Check status:**
```bash
kubectl describe managedcertificate cdr-ssl-cert
```

**Common causes:**

1. **DNS not propagated:**
   ```bash
   # Verify DNS points to correct IP
   dig your-domain.com
   nslookup your-domain.com
   ```

2. **HTTP challenge failing:**
   - Domain must be accessible via HTTP (port 80)
   - Verify ingress allows port 80 traffic

3. **Domain ownership verification:**
   - Ensure domain points to Ingress IP (not LoadBalancer IP)

**Solution:**
- Wait 24-48 hours for DNS propagation
- Verify domain resolves to correct IP
- Check Google Search Console for domain ownership issues

---

## Cost Optimization

### 13.1 Understanding GKE Costs

**Cost breakdown:**
1. **Cluster management fee**: $0.10/hour ($72/month)
2. **Compute nodes**: Based on machine type and number
3. **Load balancers**: $0.025/hour per LB
4. **Persistent disks**: $0.04/GB/month (SSD) or $0.01/GB/month (Standard)
5. **Network egress**: $0.12/GB to internet
6. **GCS storage**: $0.020/GB/month

**Example monthly cost for this app:**
- Autopilot cluster: ~$100-150 (2-3 pods, e2-medium equivalent)
- Load balancer: $18
- GCS storage (10GB): $0.20
- Network egress (100GB): $12
- **Total: ~$130-180/month**

### 13.2 Cost Reduction Strategies

1. **Use Autopilot cluster:**
   - Pay only for pod resources, not idle nodes
   - Can scale to zero when no traffic
   - Saves 20-40% vs Standard cluster

2. **Right-size resources:**
   ```yaml
   # Instead of:
   requests: { cpu: 1000m, memory: 2Gi }
   
   # Use:
   requests: { cpu: 500m, memory: 512Mi }
   ```

3. **Enable autoscaling:**
   - Scale down to 2 pods during off-hours
   - Saves 33% of compute costs at night

4. **Use Spot VMs (Standard clusters only):**
   ```bash
   # Create Spot node pool (up to 80% discount)
   gcloud container node-pools create spot-pool \
     --cluster=$CLUSTER_NAME \
     --spot \
     --enable-autoscaling \
     --min-nodes=0 \
     --max-nodes=5
   ```
   - **Caveat:** Google can terminate Spot VMs anytime
   - Use for non-critical workloads only

5. **GCS lifecycle policies:**
   ```bash
   # Delete job data older than 90 days
   gsutil lifecycle set lifecycle.json gs://${BUCKET_NAME}
   ```

6. **Set up budget alerts:**
   ```bash
   # Get notified at 50%, 75%, 100% of budget
   # Cloud Console → Billing → Budgets & alerts
   ```

---

## Security Best Practices

### 14.1 Container Security

✅ **Run as non-root user**
```dockerfile
USER nodejs  # UID 1001
```

✅ **Use minimal base images**
```dockerfile
FROM node:20-alpine  # 40MB vs 900MB for full node image
```

✅ **Scan images for vulnerabilities**
```bash
# Artifact Registry automatically scans
gcloud artifacts docker images scan \
  us-central1-docker.pkg.dev/${PROJECT_ID}/cdr-app-repo/cdr-test-suite:v1
```

❌ **Never include secrets in images**
```dockerfile
# DON'T DO THIS:
ENV DATABASE_PASSWORD=secret123
```

### 14.2 Kubernetes Security

✅ **Use Kubernetes Secrets**
- Encrypted at rest
- Access controlled via RBAC
- Never commit to Git

✅ **Network Policies**
```yaml
# Restrict pod-to-pod communication
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend-to-backend
spec:
  podSelector:
    matchLabels:
      app: backend
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: frontend
```

✅ **Workload Identity (instead of service account keys)**
```bash
# Bind Kubernetes service account to GCP service account
# Eliminates need for JSON key files
gcloud iam service-accounts add-iam-policy-binding \
  cdr-gcs-sa@${PROJECT_ID}.iam.gserviceaccount.com \
  --role roles/iam.workloadIdentityUser \
  --member "serviceAccount:${PROJECT_ID}.svc.id.goog[default/cdr-ksa]"
```

### 14.3 GCP Security

✅ **Principle of least privilege**
- Service accounts have only necessary permissions
- Separate service accounts for different services

✅ **Enable VPC-native cluster**
```bash
# Better network isolation
gcloud container clusters create ... --enable-ip-alias
```

✅ **Private cluster**
```bash
# Master API only accessible from authorized networks
gcloud container clusters create ... --enable-private-nodes
```

✅ **Audit logging**
- Cloud Audit Logs track all GCP API calls
- Who did what, when, from where

---

## Production Checklist

Before going live, verify:

### Infrastructure
- [ ] Regional cluster (3 zones for HA)
- [ ] Autoscaling configured (HPA + Cluster Autoscaler)
- [ ] Static IP reserved for ingress
- [ ] SSL certificate provisioned and active
- [ ] DNS pointing to correct IP

### Application
- [ ] Health checks passing
- [ ] Resource limits set appropriately
- [ ] Secrets managed via Kubernetes Secrets
- [ ] Environment variables configured correctly
- [ ] Database migrations applied

### Monitoring
- [ ] Cloud Logging enabled
- [ ] Cloud Monitoring dashboards created
- [ ] Uptime checks configured
- [ ] Alert policies set up
- [ ] Budget alerts configured

### Security
- [ ] Running as non-root user
- [ ] Secrets not in images
- [ ] Vulnerability scanning enabled
- [ ] Network policies applied
- [ ] Audit logging enabled

### Backup & Recovery
- [ ] GCS data backed up regularly
- [ ] Database backups configured
- [ ] Disaster recovery plan documented
- [ ] Rollback procedure tested

### Performance
- [ ] Load tested with expected traffic
- [ ] Autoscaling tested
- [ ] Latency acceptable (p95 < 500ms)
- [ ] Error rate acceptable (< 0.1%)

---

## Summary

This guide covered deploying the CDR Test Quality Suite to GKE with:

✅ **Containerization** - Multi-stage Docker builds for minimal images
✅ **Cloud Infrastructure** - GKE cluster with autoscaling and HA
✅ **Storage** - Google Cloud Storage for job persistence
✅ **Security** - Secrets management, non-root containers, least privilege
✅ **Reliability** - Health checks, rolling updates, auto-healing
✅ **Observability** - Centralized logging, monitoring, alerting
✅ **Automation** - CI/CD pipeline with GitHub Actions
✅ **Cost Optimization** - Right-sizing, autoscaling, Spot VMs

Your application is now production-ready on Google Kubernetes Engine! 🚀
