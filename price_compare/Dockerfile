FROM python:3.11-slim

WORKDIR /app

# Playwright needs extra deps
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir fastapi uvicorn playwright httpx redis

# Install Chromium for scraping
RUN playwright install chromium && playwright install-deps chromium

COPY . .

EXPOSE 8002

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8002", "--reload"]
