FROM eclipse-temurin:21-jdk-alpine AS build

WORKDIR /workspace
COPY gradlew settings.gradle build.gradle ./
COPY gradle ./gradle
RUN chmod +x gradlew
COPY src ./src
RUN ./gradlew bootJar --no-daemon

FROM eclipse-temurin:21-jre-alpine

ARG OTEL_AGENT_VERSION=2.28.1
ARG OTEL_AGENT_SHA256=faa89bdeebf9b1f52be4a4374689176717b02a59df2d8f8b6eb9aa39f9292589
RUN wget -q "https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/download/v${OTEL_AGENT_VERSION}/opentelemetry-javaagent.jar" \
      -O /opt/opentelemetry-javaagent.jar \
    && echo "${OTEL_AGENT_SHA256}  /opt/opentelemetry-javaagent.jar" | sha256sum -c - \
    && addgroup -S product-service \
    && adduser -S product-service -G product-service
WORKDIR /app
COPY --from=build /workspace/build/libs/*.jar /app/product-service.jar
USER product-service
EXPOSE 8091
ENTRYPOINT ["java", "-javaagent:/opt/opentelemetry-javaagent.jar", "-jar", "/app/product-service.jar"]
