FROM mcr.microsoft.com/playwright:v1.62.1-noble

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci || npm install

COPY . .

ENV HEADLESS=true
ENV CI=true

CMD ["npx", "cucumber-js"]
