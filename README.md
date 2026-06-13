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

Local development is Docker Compose only. Do not run the app directly on the host Node.js runtime
for normal development.

Start the app:

```bash
docker compose up web
```

Then open `http://localhost:3000`.

Run checks inside containers:

```bash
docker compose run --rm lint
docker compose run --rm test
docker compose run --rm build
```

Seed the local demo project:

```bash
docker compose run --rm seed
```

Reset local container state if needed:

```bash
docker compose down -v
```

Docker Compose uses `Dockerfile.dev` and does not change the Cloud Run production `Dockerfile` or
`cloudbuild.yaml`.

Local Compose defaults to demo/mock/local mode:

- `DATASTORE_MODE=local` stores JSON under `.local-data/db.json`.
- `STORAGE_MODE=local` stores uploads under `.local-data/uploads`.
- `AI_PROVIDER=mock`
- `AUTH_BYPASS_FOR_TEST=true`
- `.local-data` is stored in the Compose `local_data` volume, not on the host working tree.

The host `package.json` scripts are still used by CI and Docker images, but local development
commands should go through `docker compose`.

## Environment

Key variables:

- `NEXT_PUBLIC_IDENTITY_PLATFORM_API_KEY`, `NEXT_PUBLIC_IDENTITY_PLATFORM_AUTH_DOMAIN`,
  `NEXT_PUBLIC_IDENTITY_PLATFORM_PROJECT_ID` for Identity Platform web login
- `AUTH_ADMIN_EMAILS` for the bootstrap admin email allowed to manage invites
- `SESSION_COOKIE_NAME=__session`
- `AUTH_BYPASS_FOR_TEST=false` outside local tests and Docker Compose
- `AI_PROVIDER=auto|mock|gemini`
- `GEMINI_MODEL=gemini-flash-latest`
- `GEMINI_API_KEY=` for API-key mode
- `GOOGLE_GENAI_USE_VERTEXAI=true` with `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_LOCATION` for Vertex mode
- `DATASTORE_MODE=local|firestore`
- `STORAGE_MODE=local|gcs`
- `GCS_BUCKET=your-gcs-bucket-name`

Use placeholders in documentation. Put real values only in ignored Docker Compose overrides, Cloud
Run environment variables, GitHub repository variables, or a secret manager.

## Authentication and User Data

PitchForge uses Identity Platform with a server-side session cookie. Cloud Run remains
publicly reachable, but protected pages and APIs require a valid app session.

- Enable the Google sign-in provider in Identity Platform before deploying.
- `/login` signs in with Google and exchanges the Identity Platform ID token for an httpOnly session cookie.
- Only `NEXT_PUBLIC_IDENTITY_PLATFORM_*` variables are supported for auth configuration; legacy auth env aliases are intentionally not read.
- `/api/projects`, assets, runs, events, artifacts, and exports are scoped to the authenticated
  project owner.
- `/admin/invites` is limited to emails listed in `AUTH_ADMIN_EMAILS`.
- Invited users are stored in Firestore/local storage; uninvited users receive a 403 and cannot use
  the workspace.
- Billing, plan, quota, and usage limits are intentionally not implemented yet.

## Container Commands

```bash
docker compose up web
docker compose run --rm lint
docker compose run --rm test
docker compose run --rm build
docker compose run --rm seed
```

## Cloud Run Deployment Outline

Prepare Google Cloud resources outside this repository:

1. Enable required APIs for Cloud Run, Vertex AI, Firestore, Cloud Storage, Cloud Build, and Identity Platform.
2. Create a Firestore database and a Cloud Storage bucket.
3. Enable the Google sign-in provider in Identity Platform.
4. Configure the Cloud Run service account with only the permissions required for Firestore, Storage, and Vertex AI.
5. Deploy with placeholder values replaced in your shell or deployment system, not in committed files.

Identity Platform web config is used by the client bundle, so `NEXT_PUBLIC_IDENTITY_PLATFORM_*` values must be
available during the Next.js build step. The GitHub Actions + Cloud Build path below passes them as
Docker build args and runtime env values.

Example shape:

```bash
gcloud run deploy pitchforge \
  --source . \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --set-env-vars NEXT_PUBLIC_DEMO_MODE=true,AI_PROVIDER=gemini,GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_LOCATION=global,DATASTORE_MODE=firestore,STORAGE_MODE=gcs,GCS_BUCKET=your-gcs-bucket-name
```

Do not commit the concrete project ID, bucket name, or credentials used for deployment.

## Automatic Deploy from GitHub main after CI

This repository uses GitHub Actions for the gate and Cloud Build for the deploy. The deploy job runs
only after `npm run lint`, `npm test`, and `npm run build` pass on `main`.

The workflow keeps CI fast by using npm cache, one dependency install for the CI job, and a separate
Cloud Build image build only on successful `main` pushes.

Those npm scripts are CI commands. Local development remains Docker Compose only.

Keep real project identifiers, service account emails, Workload Identity Provider names, and bucket
names in GitHub repository variables, not in committed files.

Required GitHub repository variables:

- `GCP_PROJECT_ID`
- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_DEPLOY_SERVICE_ACCOUNT`
- `GCS_BUCKET`
- `IDENTITY_PLATFORM_API_KEY_NAME`
- `IDENTITY_PLATFORM_AUTH_DOMAIN`
- `IDENTITY_PLATFORM_PROJECT_ID`
- `AUTH_ADMIN_EMAILS`
- `CLOUD_RUN_RUNTIME_SERVICE_ACCOUNT`

Optional GitHub repository variables:

- `GCP_REGION`, default `asia-northeast1`
- `CLOUD_RUN_SERVICE`, default `pitchforge`
- `AR_REPOSITORY`, default `pitchforge`
- `GOOGLE_CLOUD_LOCATION`, default `global`

`cloudbuild.yaml` is called by the deploy job after CI succeeds.

Expected trigger substitutions:

- `_REGION`: Cloud Run and Artifact Registry region, for example `asia-northeast1`
- `_SERVICE`: Cloud Run service name, for example `pitchforge`
- `_AR_REPOSITORY`: Artifact Registry Docker repository name
- `_IMAGE_TAG`: Image tag, normally the GitHub commit SHA
- `_GCS_BUCKET`: Cloud Storage bucket used by the running app
- `_GOOGLE_CLOUD_LOCATION`: Vertex AI location, for example `global`
- `_IDENTITY_PLATFORM_API_KEY_NAME`: Identity Platform API key resource name. Cloud Build resolves
  the key string during image build; do not store the key string in GitHub Variables.
- `_IDENTITY_PLATFORM_AUTH_DOMAIN`, `_IDENTITY_PLATFORM_PROJECT_ID`: Identity Platform web app configuration
- `_AUTH_ADMIN_EMAILS`: bootstrap admin email list. Prefer a single bootstrap email for automated
  deploy substitutions; add more users through the invite UI.
- `_CLOUD_RUN_RUNTIME_SERVICE_ACCOUNT`: runtime service account used by Cloud Run.

The GitHub Actions deploy service account needs permission to submit Cloud Build jobs.

Cloud Build's service account needs permissions to:

- build and push images to Artifact Registry
- deploy and update the Cloud Run service
- act as the Cloud Run runtime service account

The Cloud Run runtime service account needs only the app runtime permissions:

- Vertex AI user
- Firestore user
- Cloud Storage object access for the configured bucket
