FROM node:18-alpine
RUN npm i -g @stoplight/prism-cli@4
WORKDIR /app
COPY ../openapi-mysql-fixed.json /app/openapi.json
EXPOSE 4010
CMD ["prism", "mock", "-h", "0.0.0.0", "openapi.json"]
