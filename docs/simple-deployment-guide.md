# Simple Single-Pod GKE Deployment Guide

This is a simplified deployment for running your React+Express app in a **single pod on port 3000**.

⚠️ **Note**: Single-pod deployment means:
- No high availability (if pod crashes, app is down until restart)
- No load balancing across multiple pods
- Good for: Development, testing, low-traffic apps
- For production: Use the full deployment guide with 3 replicas

---

## Quick Start (5 Steps)

### Step 1: Set Up GCP Project

```bash
export PROJECT_ID="your-project-id"
export REGION="us-central1"
export CLUSTER_NAME="cdr-simple-cluster"

gcloud config set project $PROJECT_ID
gcloud config set compute/region $REGION

# Enable required APIs
gcloud services enable container.googleapis.com
gcloud services enable artifactregistry.googleapis.com
gcloud services enable storage.googleapis.com
```

### Step 2: Build and Push Docker Image

```bash
# Create Artifact Registry repository
gcloud artifacts repositories create cdr-app-repo \
  --repository-format=docker \
  --location=$REGION \
  --description="CDR app repository"

# Configure Docker authentication
gcloud auth configure-docker ${REGION}-docker.pkg.dev

# Build image (using simple Dockerfile)
docker build -f Dockerfile.simple \
  -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/cdr-app-repo/cdr-test-suite:v1 .

# Push to registry
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/cdr-app-repo/cdr-test-suite:v1
```

### Step 3: Create GKE Cluster

```bash
# Option A: Autopilot (Recommended - Fully Managed)
gcloud container clusters create-auto $CLUSTER_NAME \
  --region=$REGION

# Option B: Standard (Single Zone, Minimal Cost)
gcloud container clusters create $CLUSTER_NAME \
  --zone=us-central1-a \
  --num-nodes=1 \
  --machine-type=e2-medium \
  --disk-size=30

# Get credentials
gcloud container clusters get-credentials $CLUSTER_NAME --region=$REGION
# OR for zonal cluster:
# gcloud container clusters get-credentials $CLUSTER_NAME --zone=us-central1-a

# Verify
kubectl get nodes
```

### Step 4: Create Secrets

```bash
# Create GCS bucket (optional - for job storage)
export BUCKET_NAME="${PROJECT_ID}-cdr-jobs"
gcloud storage buckets create gs://${BUCKET_NAME} --location=$REGION

# Create service account for GCS
gcloud iam service-accounts create cdr-gcs-sa \
  --display-name="CDR GCS Service Account"

# Grant permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:cdr-gcs-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/storage.admin"

# Create key file
gcloud iam service-accounts keys create gcs-key.json \
  --iam-account=cdr-gcs-sa@${PROJECT_ID}.iam.gserviceaccount.com

# Create Kubernetes secrets
kubectl create secret generic gcs-credentials \
  --from-file=key.json=gcs-key.json

kubectl create secret generic cdr-env-secrets \
  --from-literal=NODE_ENV=production \
  --from-literal=GCS_BUCKET_NAME=$BUCKET_NAME

kubectl create secret generic api-keys \
  --from-literal=GOOGLE_CLOUD_PROJECT=$PROJECT_ID
```

### Step 5: Deploy Application

```bash
# Update deployment with your project ID
sed -i "s/YOUR_PROJECT_ID/${PROJECT_ID}/g" k8s/single-pod-deployment.yaml

# Deploy
kubectl apply -f k8s/single-pod-deployment.yaml

# Watch deployment
kubectl get pods --watch

# Get external IP (wait 2-5 minutes)
kubectl get service cdr-app-service --watch
```

---

## Access Your Application

```bash
# Get the external IP
export EXTERNAL_IP=$(kubectl get service cdr-app-service \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

echo "Application URL: http://${EXTERNAL_IP}"

# Test
curl http://${EXTERNAL_IP}/api/health
```

Open in browser: `http://YOUR_EXTERNAL_IP`

---

## Key Differences from Full Deployment

| Feature | Single Pod | Full Production |
|---------|-----------|-----------------|
| **Replicas** | 1 pod | 3 pods |
| **Port** | 3000 | 5000 |
| **High Availability** | ❌ No | ✅ Yes (3 zones) |
| **Autoscaling** | ❌ No | ✅ Yes (HPA 2-10) |
| **Cost** | ~$30-50/month | ~$130-180/month |
| **Downtime Risk** | High | Low |
| **Use Case** | Dev/Testing | Production |

---

## Deployment Architecture

```
┌──────────────┐
│   Internet   │
└──────┬───────┘
       │
       │ HTTP Port 80
       ▼
┌──────────────────────┐
│  Load Balancer       │
│  (External IP)       │
└──────┬───────────────┘
       │
       │ Forward to port 3000
       ▼
┌────────────────────────────┐
│   Kubernetes Service       │
│   cdr-app-service          │
│   Type: LoadBalancer       │
└──────┬─────────────────────┘
       │
       │ Route to pod
       ▼
┌──────────────────────────────────┐
│   Single Pod                      │
│   ┌────────────────────────────┐ │
│   │ Container: cdr-app         │ │
│   │ Port: 3000                 │ │
│   │                            │ │
│   │ ┌────────────────────┐    │ │
│   │ │ React Frontend     │    │ │
│   │ │ (Vite build)       │    │ │
│   │ └────────────────────┘    │ │
│   │                            │ │
│   │ ┌────────────────────┐    │ │
│   │ │ Express Backend    │    │ │
│   │ │ (API + Job System) │    │ │
│   │ └────────────────────┘    │ │
│   │                            │ │
│   │ Mounts:                    │ │
│   │ • /secrets/gcs/key.json   │ │
│   └────────────────────────────┘ │
└──────────────────────────────────┘
       │
       │ GCS API calls
       ▼
┌──────────────────────────┐
│  Google Cloud Storage    │
│  Job Data + Results      │
└──────────────────────────┘
```

---

## Common Commands

### View Logs
```bash
kubectl logs -l app=cdr-app -f
```

### Restart Pod
```bash
kubectl rollout restart deployment/cdr-app
```

### Update to New Version
```bash
# Build new image
docker build -f Dockerfile.simple \
  -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/cdr-app-repo/cdr-test-suite:v2 .

# Push
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/cdr-app-repo/cdr-test-suite:v2

# Update deployment
kubectl set image deployment/cdr-app \
  cdr-app=${REGION}-docker.pkg.dev/${PROJECT_ID}/cdr-app-repo/cdr-test-suite:v2
```

### Check Pod Status
```bash
kubectl get pods
kubectl describe pod <pod-name>
kubectl top pod
```

### Shell into Pod
```bash
kubectl exec -it <pod-name> -- /bin/sh
```

---

## Environment Variables

The app receives these environment variables:

- `PORT=3000` - Application port
- `NODE_ENV=production` - Environment mode
- `GCS_BUCKET_NAME` - Google Cloud Storage bucket
- `GOOGLE_APPLICATION_CREDENTIALS=/secrets/gcs/key.json` - GCS auth
- `GOOGLE_CLOUD_PROJECT` - GCP project ID

---

## Health Check Endpoint

The deployment uses `/api/health` for health checks:

- **Liveness Probe**: Checks every 10 seconds, restarts pod if fails
- **Readiness Probe**: Checks every 5 seconds, removes from load balancer if fails

Make sure your Express app has this endpoint:

```javascript
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});
```

---

## Scaling Up (When Ready for Production)

When you need high availability:

```bash
# Scale to 3 replicas
kubectl scale deployment/cdr-app --replicas=3

# Enable autoscaling
kubectl autoscale deployment/cdr-app \
  --cpu-percent=70 \
  --min=2 \
  --max=10
```

---

## Clean Up

```bash
# Delete deployment and service
kubectl delete -f k8s/single-pod-deployment.yaml

# Delete cluster
gcloud container clusters delete $CLUSTER_NAME --region=$REGION

# Delete GCS bucket
gcloud storage rm -r gs://${BUCKET_NAME}

# Delete Artifact Registry repo
gcloud artifacts repositories delete cdr-app-repo --location=$REGION
```

---

## Troubleshooting

### Pod won't start
```bash
kubectl describe pod <pod-name>
kubectl logs <pod-name>
```

### Can't pull image
```bash
# Verify image exists
gcloud artifacts docker images list ${REGION}-docker.pkg.dev/${PROJECT_ID}/cdr-app-repo

# Check authentication
gcloud auth configure-docker ${REGION}-docker.pkg.dev
```

### No external IP
```bash
# Check service
kubectl describe service cdr-app-service

# Verify service type is LoadBalancer
kubectl get service cdr-app-service -o yaml | grep type
```

### Health check failing
```bash
# Check if /api/health endpoint works
kubectl port-forward deployment/cdr-app 3000:3000
curl http://localhost:3000/api/health
```

---

## Cost Estimate

**Monthly cost for single-pod setup:**

- **GKE Cluster**: $72 (management fee) + $20-30 (1 node, e2-medium)
- **Load Balancer**: $18
- **GCS Storage**: $0.20 (10GB)
- **Network Egress**: ~$5-10

**Total: ~$115-130/month**

**To reduce costs:**
- Use zonal cluster instead of regional (1/3 cost)
- Use smaller machine type (e2-small for dev)
- Delete cluster when not in use

---

## Summary

✅ **You've deployed**: Single pod running React+Express on port 3000
✅ **External access**: Via Google Cloud Load Balancer
✅ **Storage**: Google Cloud Storage for async jobs
✅ **Monitoring**: Health checks and logs via kubectl

**Next steps:**
- Set up SSL with Ingress (see full deployment guide)
- Configure custom domain
- Add monitoring/alerting
- Scale to 3 replicas for production
