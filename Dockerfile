# KuasaPrestij FastAPI backend — Cloud Run–ready production image.
# Serves uvicorn app.main:app. Honors Cloud Run's injected $PORT (defaults to
# 8001 for local runs, matching deploy/kuasaprestij.service).
#
#   # local:
#   docker build -t kuasaprestij-api .
#   docker run --env-file .env -p 8001:8001 kuasaprestij-api
#
#   # Cloud Run (source deploy builds this same Dockerfile):
#   gcloud run deploy kuasaprestij-api --source . --region asia-southeast1 \
#       --min-instances=1 --memory=4Gi --cpu=2
#
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    # The embedding model is BAKED into the image below (Cloud Run has no
    # persistent volume), so its cache must live at a fixed in-image path.
    HF_HOME=/models

WORKDIR /app

# libgomp1 is required by torch (pulled in by sentence-transformers).
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Install the CPU-only torch wheel FIRST so sentence-transformers reuses it
# instead of pulling the multi-GB CUDA build (Cloud Run has no GPU).
RUN pip install torch --index-url https://download.pytorch.org/whl/cpu

# Install deps first so the layer caches across code-only changes.
COPY requirements.txt .
RUN pip install -r requirements.txt

# Bake the 768-dim multilingual embedding model into the image so cold starts
# don't re-download ~1GB from Hugging Face. Uses the exact same id the app
# loads (agents/llm_client.py) so the HF_HOME cache key matches at runtime.
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('paraphrase-multilingual-mpnet-base-v2')"

COPY . .

# Documentation only; Cloud Run ignores EXPOSE and routes to $PORT.
EXPOSE 8001

# Shell form so ${PORT} expands: Cloud Run sets it (8080), local defaults to 8001.
CMD exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8001}
