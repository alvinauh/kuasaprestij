# KuasaPrestij FastAPI backend — production image.
# Mirrors deploy/kuasaprestij.service: uvicorn app.main:app on port 8001.
#
#   docker build -t kuasaprestij-api .
#   docker run --env-file .env -p 8001:8001 -v kuasa-models:/models kuasaprestij-api
#
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    # sentence-transformers downloads the 768-dim multilingual model on first use;
    # point its cache at a mounted volume so it survives container restarts.
    HF_HOME=/models

WORKDIR /app

# libgomp1 is required by torch (pulled in by sentence-transformers).
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Install deps first so the layer caches across code-only changes.
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

EXPOSE 8001

# Env comes from --env-file / compose env_file, not baked into the image.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
