FROM node:20-slim AS frontend_build
WORKDIR /frontend

COPY frontend/package.json ./package.json
COPY frontend/package-lock.json ./package-lock.json

# Keep image build resilient when lockfile is out of sync.
RUN npm install --no-audit --no-fund

COPY frontend/ .
RUN npm run build


FROM python:3.11-slim
WORKDIR /app

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir uv && uv pip install --system -r requirements.txt

COPY backend/ ./

# Embed frontend build output:
RUN mkdir -p ./frontend_dist
COPY --from=frontend_build /frontend/dist ./frontend_dist

EXPOSE 8058
CMD ["python", "app.py"]
