FROM ghcr.io/puppeteer/puppeteer:21.6.1

USER root
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

USER pptruser

CMD ["npm", "start"]
