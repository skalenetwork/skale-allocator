FROM node:12.18.3

RUN mkdir /usr/src/allocator
WORKDIR /usr/src/allocator

RUN apt-get update && apt-get install build-essential

COPY package.json ./
COPY truffle-config.js ./
COPY yarn.lock ./
RUN yarn install

RUN echo 'ping localhost &' > /bootstrap.sh
RUN echo 'sleep infinity' >> /bootstrap.sh
RUN chmod +x /bootstrap.sh

COPY . .