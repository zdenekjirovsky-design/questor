# Server QUESTOR — Node 26 + tsx runtime (žádný build krok, viz ARCHITEKTURA.md).
# Sestavení Z KOŘENE monorepa (Dockerfile potřebuje workspace manifesty):
#   docker build -f server/Dockerfile -t questor-server .
# Spuštění:
#   docker run -p 8787:8787 -e QUESTOR_ADMIN_TOKEN=... -e QUESTOR_STUDENT_TOKEN=... \
#     [-e ANTHROPIC_API_KEY=...] -v questor-data:/app/server/data questor-server

FROM node:26-alpine

WORKDIR /app
ENV NODE_ENV=production

# Manifesty všech workspaces (npm ci je vyžaduje), instalují se jen server
# + generator (kvůli dogenerování) a jejich workspace závislost sdilene.
COPY package.json package-lock.json ./
COPY sdilene/package.json sdilene/package.json
COPY generator/package.json generator/package.json
COPY server/package.json server/package.json
COPY aplikace/package.json aplikace/package.json
RUN npm ci --omit=dev -w server -w generator --no-audit --no-fund

# Zdrojáky (běží přímo přes tsx — tsx je prod závislost serveru).
COPY sdilene/ sdilene/
COPY generator/ generator/
COPY server/ server/

EXPOSE 8787
ENV QUESTOR_PORT=8787

CMD ["npm", "run", "start", "-w", "server"]
