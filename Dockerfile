# Multi-platform index verified against Docker Hub (A-22).
FROM node:22-bookworm-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
# The build has no user configuration, corpus, database or credentials.
RUN printf '%s\n' 'export default { schemaVersion: 1, corpus: { name: "placeholder", title: "Sourced", description: "your documents", language: "en" }, sources: [], profile: "local", models: { chat: { provider: "ollama", model: "placeholder" }, embed: { provider: "ollama", model: "placeholder", dimensions: 1536 } } };' > sourced.config.ts
RUN pnpm build
RUN pnpm prune --prod

FROM node:22-bookworm-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d AS runtime
ARG UID=1000
RUN userdel node && useradd --uid "${UID}" --create-home sourced && corepack enable
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 COREPACK_HOME=/opt/corepack
COPY --from=deps --chown=sourced:sourced /root/.cache/node/corepack /opt/corepack
COPY --from=build --chown=sourced:sourced /app/node_modules ./node_modules
COPY --from=build --chown=sourced:sourced /app/.next ./.next
COPY --from=build --chown=sourced:sourced /app/package.json /app/tsconfig.json ./
COPY --chown=sourced:sourced scripts ./scripts
COPY --chown=sourced:sourced lib ./lib
COPY --chown=sourced:sourced drizzle ./drizzle
COPY --chown=sourced:sourced public ./public
# Runtime data always comes from the host. Ancestor resolution also lets a clean
# mounted TypeScript config import packages without installing Node on the host.
RUN ln -s /app/node_modules /node_modules \
    && ln -s /workspace/.sourced /app/.sourced \
    && ln -s /workspace/sourced.config.ts /app/sourced.config.ts \
    && ln -s /workspace/corpus /app/corpus \
    && ln -s /workspace/eval /app/eval \
    && printf '%s\n' 'export default { poweredByHeader: false };' > next.config.mjs \
    && chmod 755 scripts/docker-entrypoint.sh
USER sourced
WORKDIR /workspace
EXPOSE 3000
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
CMD ["app"]
