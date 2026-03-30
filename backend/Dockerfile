FROM node:20-slim AS frontend_build
WORKDIR /frontend

COPY frontend/package.json ./package.json
COPY frontend/package-lock.json ./package-lock.json

# If you have a lockfile later, switching to `npm ci` would be better.
# Keep it simple here; `npm install` will still work without it.
RUN npm ci

COPY frontend/ .
RUN npm run build


FROM python:3.11-slim
WORKDIR /app

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir uv && uv pip install -r requirements.txt

COPY backend/ ./

# Embed frontend build output:
RUN mkdir -p ./frontend_dist
COPY --from=frontend_build /frontend/dist ./frontend_dist

EXPOSE 8058
CMD ["uv", "run", "app.py"]
