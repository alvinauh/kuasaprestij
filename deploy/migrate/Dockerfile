FROM python:3.11-slim

RUN pip install --no-cache-dir psycopg2-binary requests

WORKDIR /app
COPY schema.sql migrate.py ./

CMD ["python", "/app/migrate.py"]
