FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV VITE_AUTH_ENABLED=false
RUN npm run build
EXPOSE 8080
# Preview server is enough until you swap in the Nitro output server.
CMD ["npm", "run", "preview"]
