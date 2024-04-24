FROM node:18-alpine  

WORKDIR /server

COPY package.json ./

RUN npm install --production
#RUN npm install -g nodemon


COPY . .

EXPOSE 3001

#CMD nodemon server.js
CMD npm start