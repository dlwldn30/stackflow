FROM node:22-alpine AS build

WORKDIR /workspace
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_DEFAULT_PROJECT_PATH=/workspace/distributed-trace-lab
ARG VITE_DEFAULT_TARGET_BASE_URL=http://order-service:8092
ARG VITE_DEMO_TRACE_READY=true
ENV VITE_DEFAULT_PROJECT_PATH=$VITE_DEFAULT_PROJECT_PATH
ENV VITE_DEFAULT_TARGET_BASE_URL=$VITE_DEFAULT_TARGET_BASE_URL
ENV VITE_DEMO_TRACE_READY=$VITE_DEMO_TRACE_READY
RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/dist /usr/share/nginx/html
EXPOSE 80
