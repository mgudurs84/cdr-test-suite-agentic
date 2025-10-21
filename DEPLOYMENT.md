# CDR Test Quality Suite - GKE Deployment Instructions

## Prerequisites

Before you start, make sure you have:

- [ ] Google Cloud account with billing enabled
- [ ] `gcloud` CLI installed ([Install here](https://cloud.google.com/sdk/docs/install))
- [ ] `kubectl` installed ([Install here](https://kubernetes.io/docs/tasks/tools/))
- [ ] Docker installed and running

---

## Step-by-Step Deployment

### Step 1: Set Up Google Cloud Project (5 minutes)

```bash
# Set your project ID (replace with your actual project ID)
export PROJECT_ID="your-project-id"
export REGION="us-central1"
export CLUSTER_NAME="cdr-simple-cluster"

# Login to Google Cloud
gcloud auth login

# Set the project
gcloud config set project $PROJECT_ID
gcloud config set compute/region $REGION

# Enable required APIs (this may take 2-3 minutes)
gcloud services enable container.googleapis.com
gcloud services enable artifactregistry.googleapis.com
gcloud services enable storage.googleapis.com

# Verify
gcloud services list --enabled | grep -E "container|artifact|storage"
```

---

### Step 2: Create Artifact Registry for Docker Images (2 minutes)

```bash
# Create repository
gcloud artifacts repositories create cdr-app-repo \
  --repository-format=docker \
  --location=$REGION \
  --description="CDR Test Quality Suite Docker images"

# Configure Docker to authenticate with Artifact Registry
gcloud auth configure-docker ${REGION}-docker.pkg.dev

# Verify
gcloud artifacts repositories list --location=$REGION
```

---

### Step 3: Build and Push Docker Image (5-10 minutes)

```bash
# Build the Docker image
docker build -f Dockerfile.simple \
  -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/cdr-app-repo/cdr-test-suite:v1 .

# Push to Artifact Registry (this may take several minutes)
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/cdr-app-repo/cdr-test-suite:v1

# Verify image was pushed
gcloud artifacts docker images list \
  ${REGION}-docker.pkg.dev/${PROJECT_ID}/cdr-app-repo
```

---

### Step 4: Create GKE Cluster (10-15 minutes)

Choose **ONE** option:

#### Option A: Autopilot (Recommended - Fully Managed)
```bash
gcloud container clusters create-auto $CLUSTER_NAME \
  --region=$REGION

# Get credentials
gcloud container clusters get-credentials $CLUSTER_NAME --region=$REGION
```

#### Option B: Standard (Manual Control, Lower Cost)
```bash
gcloud container clusters create $CLUSTER_NAME \
  --zone=us-central1-a \
  --num-nodes=1 \
  --machine-type=e2-medium \
  --disk-size=30

# Get credentials
gcloud container clusters get-credentials $CLUSTER_NAME --zone=us-central1-a
```

**Verify cluster is running:**
```bash
kubectl get nodes
# Should show 1 node in "Ready" status
```

---

### Step 5: Create Google Cloud Storage Bucket (1 minute)

```bash
# Create bucket for job storage
export BUCKET_NAME="${PROJECT_ID}-cdr-jobs"
gcloud storage buckets create gs://${BUCKET_NAME} \
  --location=$REGION

# Verify
gcloud storage ls
```

---

### Step 6: Create Service Account & Credentials (3 minutes)

```bash
# Create service account
gcloud iam service-accounts create cdr-gcs-sa \
  --display-name="CDR GCS Service Account"

# Grant storage permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:cdr-gcs-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/storage.admin"

# Generate key file
gcloud iam service-accounts keys create gcs-key.json \
  --iam-account=cdr-gcs-sa@${PROJECT_ID}.iam.gserviceaccount.com

# Verify key file was created
ls -lh gcs-key.json
```

---

### Step 7: Create Kubernetes Secrets (1 minute)

```bash
# Create secret for GCS credentials
kubectl create secret generic gcs-credentials \
  --from-file=key.json=gcs-key.json

# Create secret for environment variables
kubectl create secret generic cdr-env-secrets \
  --from-literal=GCS_BUCKET_NAME=$BUCKET_NAME

# Create secret for API keys
kubectl create secret generic api-keys \
  --from-literal=GOOGLE_CLOUD_PROJECT=$PROJECT_ID

# Verify secrets were created
kubectl get secrets
```

---

### Step 8: Update Deployment Configuration (1 minute)

```bash
# Replace YOUR_PROJECT_ID with actual project ID in the deployment file
sed -i.bak "s/YOUR_PROJECT_ID/${PROJECT_ID}/g" k8s/single-pod-deployment.yaml

# Verify the change
grep "image:" k8s/single-pod-deployment.yaml
# Should show your actual project ID, not YOUR_PROJECT_ID
```

---

### Step 9: Deploy Application to Kubernetes (2 minutes)

```bash
# Apply the deployment
kubectl apply -f k8s/single-pod-deployment.yaml

# Watch deployment progress
kubectl get pods --watch
# Wait until STATUS shows "Running" (press Ctrl+C to stop watching)
```

---

### Step 10: Get External IP Address (2-5 minutes)

```bash
# Watch for external IP (this can take 2-5 minutes)
kubectl get service cdr-app-service --watch
# Wait until EXTERNAL-IP shows an IP address (not <pending>)
# Press Ctrl+C when you see the IP

# Get the IP
export EXTERNAL_IP=$(kubectl get service cdr-app-service \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

echo "Your application is available at: http://${EXTERNAL_IP}"
```

---

### Step 11: Test Your Deployment ✅

```bash
# Test health endpoint
curl http://${EXTERNAL_IP}/api/health

# Expected response:
# {"status":"ok"}

# Open in browser
echo "Open this URL in your browser: http://${EXTERNAL_IP}"
```

---

## Verification Checklist

Run these commands to verify everything is working:

```bash
# Check pod status
kubectl get pods
# Should show: cdr-app-xxx   1/1   Running

# Check service
kubectl get service cdr-app-service
# Should show EXTERNAL-IP

# View logs
kubectl logs -l app=cdr-app --tail=50

# Check health endpoint
curl http://${EXTERNAL_IP}/api/health
```

---

## Common Issues & Solutions

### Issue: Pod shows "ImagePullBackOff"
**Solution:**
```bash
# Verify image exists
gcloud artifacts docker images list ${REGION}-docker.pkg.dev/${PROJECT_ID}/cdr-app-repo

# Check pod events
kubectl describe pod <pod-name>
```

### Issue: External IP stuck on "pending"
**Solution:**
```bash
# Wait longer (can take up to 5 minutes)
# Check service status
kubectl describe service cdr-app-service

# For Autopilot clusters, this is normal and may take longer
```

### Issue: Health check failing
**Solution:**
```bash
# Check pod logs
kubectl logs -l app=cdr-app

# Port-forward to test locally
kubectl port-forward deployment/cdr-app 3000:3000
curl http://localhost:3000/api/health
```

### Issue: Secrets not found
**Solution:**
```bash
# Verify secrets exist
kubectl get secrets

# Recreate if missing
kubectl delete secret gcs-credentials cdr-env-secrets api-keys
# Then run Step 7 again
```

---

## Useful Commands

### View Application Logs
```bash
kubectl logs -l app=cdr-app -f --tail=100
```

### Restart Application
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

### Shell into Running Pod
```bash
POD_NAME=$(kubectl get pod -l app=cdr-app -o jsonpath='{.items[0].metadata.name}')
kubectl exec -it $POD_NAME -- /bin/sh
```

### Check Resource Usage
```bash
kubectl top pod
kubectl top node
```

---

## Clean Up (Delete Everything)

**⚠️ WARNING: This will delete all resources and cannot be undone!**

```bash
# Delete Kubernetes resources
kubectl delete -f k8s/single-pod-deployment.yaml
kubectl delete secret gcs-credentials cdr-env-secrets api-keys

# Delete GKE cluster
gcloud container clusters delete $CLUSTER_NAME --region=$REGION --quiet
# OR for zonal cluster:
# gcloud container clusters delete $CLUSTER_NAME --zone=us-central1-a --quiet

# Delete GCS bucket
gcloud storage rm -r gs://${BUCKET_NAME}

# Delete Artifact Registry repository
gcloud artifacts repositories delete cdr-app-repo --location=$REGION --quiet

# Delete service account
gcloud iam service-accounts delete cdr-gcs-sa@${PROJECT_ID}.iam.gserviceaccount.com --quiet

# Remove local key file
rm gcs-key.json
```

---

## Cost Estimate

**Monthly cost for this deployment:**

- GKE Autopilot cluster: ~$72 (management) + $30-50 (compute)
- Load Balancer: ~$18
- GCS Storage: ~$0.20 (for 10GB)
- Artifact Registry: ~$0.10
- **Total: ~$120-140/month**

**To minimize costs:**
- Use Standard cluster with e2-small instances (~$25/month)
- Delete cluster when not in use
- Use preemptible nodes (not recommended for production)

---

## Next Steps

Once deployed successfully:

1. **Set up custom domain** - Point your domain to the external IP
2. **Enable HTTPS** - Use Google-managed SSL certificates
3. **Set up monitoring** - Enable Google Cloud Monitoring
4. **Configure CI/CD** - Automate deployments with Cloud Build
5. **Scale up** - Increase replicas when traffic grows

For detailed guides, see:
- `docs/simple-deployment-guide.md` - Full deployment documentation
- `docs/single-pod-architecture.md` - Architecture diagrams

---

## Support

If you encounter issues:

1. Check logs: `kubectl logs -l app=cdr-app`
2. Check pod status: `kubectl describe pod <pod-name>`
3. Review the troubleshooting section above
4. Check Google Cloud Console for errors

**Your app should now be running at:** `http://YOUR_EXTERNAL_IP`
