FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY config ./config
COPY src ./src
COPY static ./static
RUN mkdir -p data dist
ENV PORT=8080
EXPOSE 8080
# Server pri štarte stiahne správy, vygeneruje web a potom ho obnovuje každých refreshMinutes.
CMD ["node", "src/serve.js"]
