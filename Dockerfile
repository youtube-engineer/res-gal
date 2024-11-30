FROM node:22.11.0-alpine

COPY package.json package-lock.json ./
RUN npm install

COPY . .

EXPOSE 8080

CMD ["node", "main.js"]

