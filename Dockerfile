FROM python:3.11-slim-bookworm

WORKDIR /app

# Install system dependencies needed for pymssql and timezone
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libc-dev \
    curl \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

ENV TZ=Asia/Bangkok
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5030

CMD ["gunicorn", "--workers", "2", "--bind", "0.0.0.0:5030", "--timeout", "120", "app:app"]
