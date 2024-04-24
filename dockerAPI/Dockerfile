FROM node:18  
RUN apt update -y
RUN apt install docker-compose -y
WORKDIR /server

COPY package.json ./

RUN npm install --production
#RUN npm install -g nodemon


COPY . .
RUN mkdir -p /root/.docker
COPY credsdocker.json /root/.docker/config.json

EXPOSE 3002

#CMD nodemon --ignore 'dockers/*' server.js
CMD npm start
