FROM python:3.12.11-slim-bookworm@sha256:c00fc7b44d844b6da22861ec24af43968a5200eac4ec607b4725d585165d6b49 AS build

ARG FFMPEG_VERSION=8.1.2
ARG FFMPEG_SHA256=464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c
ARG LIBVPX_VERSION=1.15.2
ARG LIBVPX_SHA256=26fcd3db88045dee380e581862a6ef106f49b74b6396ee95c2993a260b4636aa
ARG OPUS_VERSION=1.5.2
ARG OPUS_SHA256=65c1d2f78b9f2fb20082c38cbe47c951ad5839345876e46941612ee87f9a7ce1
ARG LIBREOFFICE_VERSION=4:7.4.7-1+deb12u14
ARG BIREFNET_LITE_MODEL_URL=https://huggingface.co/onnx-community/BiRefNet_lite-ONNX/resolve/de15b22ba131738a16dff04aab8bdf8dc32e3ac1/onnx/model.onnx
ARG BIREFNET_LITE_MODEL_SHA256=5600024376f572a557870a5eb0afb1e5961636bef4e1e22132025467d0f03333

RUN apt-get update \
    && apt-get install --no-install-recommends -y \
      autoconf \
      automake \
      build-essential \
      ca-certificates \
      curl \
      libtool \
      nasm \
      pkg-config \
      yasm \
      xz-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /tmp/build

RUN curl -fsSL "https://github.com/webmproject/libvpx/archive/refs/tags/v${LIBVPX_VERSION}.tar.gz" -o libvpx.tar.gz \
    && echo "${LIBVPX_SHA256}  libvpx.tar.gz" | sha256sum -c - \
    && mkdir libvpx \
    && tar -xzf libvpx.tar.gz -C libvpx --strip-components=1 \
    && cd libvpx \
    && ./configure --prefix=/opt/codec --enable-shared --disable-static --disable-examples --disable-tools --disable-unit-tests --disable-docs \
    && make -j"$(nproc)" \
    && make install

RUN curl -fsSL "https://github.com/xiph/opus/releases/download/v${OPUS_VERSION}/opus-${OPUS_VERSION}.tar.gz" -o opus.tar.gz \
    && echo "${OPUS_SHA256}  opus.tar.gz" | sha256sum -c - \
    && mkdir opus \
    && tar -xzf opus.tar.gz -C opus --strip-components=1 \
    && cd opus \
    && ./configure --prefix=/opt/codec --enable-shared --disable-static --disable-doc --disable-extra-programs \
    && make -j"$(nproc)" \
    && make install

RUN curl -fsSL "https://ffmpeg.org/releases/ffmpeg-${FFMPEG_VERSION}.tar.xz" -o ffmpeg.tar.xz \
    && echo "${FFMPEG_SHA256}  ffmpeg.tar.xz" | sha256sum -c - \
    && mkdir ffmpeg \
    && tar -xJf ffmpeg.tar.xz -C ffmpeg --strip-components=1 \
    && cd ffmpeg \
    && PKG_CONFIG_PATH=/opt/codec/lib/pkgconfig ./configure \
      --prefix=/opt/ffmpeg \
      --pkg-config-flags=--static \
      --extra-cflags=-I/opt/codec/include \
      --extra-ldflags=-L/opt/codec/lib \
      --extra-libs="-lpthread -lm" \
      --enable-shared \
      --disable-static \
      --disable-autodetect \
      --disable-debug \
      --disable-doc \
      --disable-network \
      --disable-avdevice \
      --disable-gpl \
      --disable-nonfree \
      --disable-everything \
      --enable-ffmpeg \
      --enable-ffprobe \
      --enable-avcodec \
      --enable-avformat \
      --enable-avfilter \
      --enable-avutil \
      --enable-swresample \
      --enable-swscale \
      --enable-filter=aresample \
      --enable-protocol=file \
      --enable-protocol=pipe \
      --enable-demuxer=mov \
      --enable-demuxer=matroska \
      --enable-muxer=matroska \
      --enable-muxer=webm \
      --enable-decoder=h264 \
      --enable-decoder=mpeg4 \
      --enable-decoder=aac \
      --enable-encoder=libvpx_vp9 \
      --enable-encoder=libopus \
      --enable-parser=h264 \
      --enable-parser=mpeg4video \
      --enable-parser=aac \
      --enable-libvpx \
      --enable-libopus \
    && make -j"$(nproc)" \
    && make install \
    && strip /opt/ffmpeg/bin/ffmpeg /opt/ffmpeg/bin/ffprobe

RUN mkdir -p /opt/models \
    && curl -fsSL "${BIREFNET_LITE_MODEL_URL}" -o /opt/models/birefnet-lite.onnx \
    && echo "${BIREFNET_LITE_MODEL_SHA256}  /opt/models/birefnet-lite.onnx" | sha256sum -c -

FROM python:3.12.11-slim-bookworm@sha256:c00fc7b44d844b6da22861ec24af43968a5200eac4ec607b4725d585165d6b49

ARG LIBREOFFICE_VERSION=4:7.4.7-1+deb12u14

RUN apt-get update \
    && apt-get install --no-install-recommends -y \
      "libreoffice-core-nogui=${LIBREOFFICE_VERSION}" \
      "libreoffice-draw-nogui=${LIBREOFFICE_VERSION}" \
      "libreoffice-writer-nogui=${LIBREOFFICE_VERSION}" \
      fontconfig \
      fonts-dejavu \
      fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FFMPEG_BIN=/opt/ffmpeg/bin/ffmpeg \
    FFPROBE_BIN=/opt/ffmpeg/bin/ffprobe \
    SOFFICE_BIN=/usr/bin/soffice \
    BACKGROUND_MODEL_PATH=/opt/models/birefnet-lite.onnx \
    LD_LIBRARY_PATH=/opt/ffmpeg/lib:/opt/codec/lib

COPY --from=build /opt/codec /opt/codec
COPY --from=build /opt/ffmpeg /opt/ffmpeg
COPY --from=build /opt/models /opt/models
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY processor.py /app/processor.py
COPY THIRD-PARTY-NOTICES.md /app/THIRD-PARTY-NOTICES.md
COPY LICENSE-STATUS.md /app/LICENSE-STATUS.md
COPY verify-build.sh /app/verify-build.sh

RUN useradd --uid 10001 --create-home --shell /usr/sbin/nologin dmf \
    && mkdir -p /tmp/domyfile \
    && chmod 0555 /app/verify-build.sh \
    && /app/verify-build.sh \
    && chown -R dmf:dmf /tmp/domyfile
USER dmf
WORKDIR /app
EXPOSE 8080
CMD ["python", "/app/processor.py"]
