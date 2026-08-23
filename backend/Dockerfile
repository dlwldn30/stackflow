FROM eclipse-temurin:21-jdk-alpine AS build

WORKDIR /workspace
COPY gradlew settings.gradle build.gradle ./
COPY gradle ./gradle
RUN chmod +x gradlew
COPY src ./src
RUN ./gradlew bootJar --no-daemon

FROM eclipse-temurin:21-jre-alpine

RUN addgroup -S stackflow && adduser -S stackflow -G stackflow
WORKDIR /app
COPY --from=build /workspace/build/libs/*.jar /app/stackflow.jar
USER stackflow
EXPOSE 18080
ENTRYPOINT ["java", "-jar", "/app/stackflow.jar"]
