FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev
COPY lib ./lib
COPY gateway ./gateway
USER node
EXPOSE 8080
CMD ["node", "gateway/server.js"]
