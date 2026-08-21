FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    FFMPEG_BIN=/usr/bin/ffmpeg \
    FFPROBE_BIN=/usr/bin/ffprobe \
    SOFFICE_BIN=/usr/bin/soffice

RUN apt-get update \
    && apt-get install --no-install-recommends -y \
      ffmpeg \
      fonts-dejavu \
      fonts-liberation \
      libreoffice-core-nogui \
      libreoffice-draw-nogui \
      libreoffice-writer-nogui \
      qpdf \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./requirements.txt
RUN python -m pip install -r requirements.txt
COPY app.py ./app.py

RUN useradd --uid 10001 --create-home --shell /usr/sbin/nologin dmf \
    && mkdir -p /tmp/domyfile-render \
    && chown -R dmf:dmf /app /tmp/domyfile-render

USER dmf
EXPOSE 10000
CMD ["sh", "-c", "exec uvicorn app:app --host 0.0.0.0 --port ${PORT:-10000} --workers 1 --no-access-log"]
