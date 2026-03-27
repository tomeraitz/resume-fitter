FROM node:22-alpine AS base
RUN apk add --no-cache openjdk17-jre-headless python3 py3-pip \
    && python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install PyMuPDF
ENV PATH="/opt/venv/bin:$PATH"
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

FROM base AS build
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ src/
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules node_modules/
COPY --from=build /app/dist dist/
COPY src/prompts/ dist/prompts/
COPY convert_pdf.py ./
COPY package.json ./
EXPOSE 3001
CMD ["node", "dist/index.js"]
