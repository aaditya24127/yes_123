# The whole backend as one package for a cloud server (Railway, Render, AWS Mumbai, any VPS).
# The people who install the app never see any of this: the app only talks to the address where this runs.
#
# Build (from the project folder):   docker build -f backend/Dockerfile -t crp-backend .
# Run:                               docker run -p 8000:8000 --env-file .env crp-backend
# Keys and the database address come from the host's environment settings (never baked into the image).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /srv

COPY backend/requirements.txt backend/requirements.txt
RUN pip install -r backend/requirements.txt

# Download the free speech-to-text model into the image so the first recording is not slow (about 145 MB).
ARG WHISPER_MODEL=base
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('${WHISPER_MODEL}', device='cpu', compute_type='int8')"

COPY backend backend
COPY config config
COPY database/migrations database/migrations
COPY database/seed_data database/seed_data
COPY database/cli.py database/cli.py

# Files are stored in Supabase Storage in the cloud (STORAGE_BACKEND=supabase); LOCAL_STORAGE_ROOT is only a fallback.
ENV LOCAL_STORAGE_ROOT=/srv/storage WORKERS_IN_API=1
EXPOSE 8000
# Bring the database up to date, then serve. Extra workers: run the same image with  python -m app.jobs  (working dir backend).
CMD ["sh", "-c", "python database/cli.py migrate && cd backend && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
