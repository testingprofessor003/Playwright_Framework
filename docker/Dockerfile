FROM mcr.microsoft.com/playwright:v1.62.1-noble

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci || npm install

COPY . .

ENV HEADLESS=true
ENV CI=true
ENV CHROMIUM_SANDBOX=false

CMD ["npx", "cucumber-js"]
