# PitchForge

PitchForge is an AI director studio for hackathon submissions. It turns a rough prototype description, URLs, screenshots, and Google Cloud usage notes into judge-facing artifacts: scores, demo scripts, Proto Pedia copy, thumbnail concepts, architecture copy, and an export bundle.

## Public Repository Safety

This repository is intended to be public.

- Do not commit `.env`, `.env.local`, service account JSON, uploaded screenshots, generated exports, or `.local-data/`.
- Keep `.env.example` as placeholders only.
- Do not paste real API keys, access tokens, service account emails, project IDs, bucket names, or private customer data into README, tests, fixtures, screenshots, or issues.
- Runtime status APIs intentionally expose only coarse mode labels, not credentials.
- User-provided project text and screenshots are treated as untrusted source material in AI prompts.

## Local Development

```bash
npm install
cp .env.example .env.local
npm run dev
```

By default, the app runs in demo/local mode:

- `DATASTORE_MODE=local` stores JSON under `.local-data/db.json`.
- `STORAGE_MODE=local` stores uploads under `.local-data/uploads`.
- `AI_PROVIDER=auto` uses the mock provider unless Gemini credentials are configured.

## Environment

Key variables:

- `AI_PROVIDER=auto|mock|gemini`
- `GEMINI_MODEL=gemini-flash-latest`
- `GEMINI_API_KEY=` for API-key mode
- `GOOGLE_GENAI_USE_VERTEXAI=true` with `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_LOCATION` for Vertex mode
- `DATASTORE_MODE=local|firestore`
- `STORAGE_MODE=local|gcs`
- `GCS_BUCKET=your-gcs-bucket-name`

Use placeholders in documentation. Put real values only in local environment files, Cloud Run environment variables, or a secret manager.

## Scripts

```bash
npm run dev
npm test
npm run lint
npm run build
npm run seed:demo
```

## Cloud Run Deployment Outline

Prepare Google Cloud resources outside this repository:

1. Enable required APIs for Cloud Run, Vertex AI, Firestore, Cloud Storage, and Cloud Build.
2. Create a Firestore database and a Cloud Storage bucket.
3. Configure the Cloud Run service account with only the permissions required for Firestore, Storage, and Vertex AI.
4. Deploy with placeholder values replaced in your shell or deployment system, not in committed files.

Example shape:

```bash
gcloud run deploy pitchforge \
  --source . \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --set-env-vars NEXT_PUBLIC_DEMO_MODE=true,AI_PROVIDER=gemini,GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_LOCATION=global,DATASTORE_MODE=firestore,STORAGE_MODE=gcs,GCS_BUCKET=your-gcs-bucket-name
```

Do not commit the concrete project ID, bucket name, or credentials used for deployment.

## Automatic Deploy from GitHub main

This repository includes `cloudbuild.yaml` for a Cloud Build trigger. Keep real project identifiers
and bucket names in trigger substitutions, not in committed files.

Expected trigger substitutions:

- `_REGION`: Cloud Run and Artifact Registry region, for example `asia-northeast1`
- `_SERVICE`: Cloud Run service name, for example `pitchforge`
- `_AR_REPOSITORY`: Artifact Registry Docker repository name
- `_GCS_BUCKET`: Cloud Storage bucket used by the running app
- `_GOOGLE_CLOUD_LOCATION`: Vertex AI location, for example `global`

The trigger should run on pushes to `^main$` and use `cloudbuild.yaml`.

Cloud Build's service account needs permissions to:

- build and push images to Artifact Registry
- deploy and update the Cloud Run service
- act as the Cloud Run runtime service account

The Cloud Run runtime service account needs only the app runtime permissions:

- Vertex AI user
- Firestore user
- Cloud Storage object access for the configured bucket
