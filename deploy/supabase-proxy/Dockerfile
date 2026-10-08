FROM python:3.11-slim
RUN pip install --no-cache-dir fastapi uvicorn[standard] httpx
WORKDIR /app
COPY proxy.py ./
CMD ["uvicorn", "proxy:app", "--host", "0.0.0.0", "--port", "8080"]
