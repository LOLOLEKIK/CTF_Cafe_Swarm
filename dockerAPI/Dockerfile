FROM node:18  
RUN apt update -y
RUN apt install docker-compose -y
WORKDIR /server

COPY package.json ./

RUN npm install --production

COPY . .

EXPOSE 3002

CMD npm start
