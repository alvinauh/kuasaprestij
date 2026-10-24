FROM python:3.11-slim
WORKDIR /app
RUN pip install --no-cache-dir requests psycopg2-binary
COPY migrate.py .
CMD ["python", "migrate.py"]
