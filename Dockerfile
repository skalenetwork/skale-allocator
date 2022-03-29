FROM node:12.18.3

RUN mkdir /usr/src/allocator
WORKDIR /usr/src/allocator

RUN apt-get update && apt-get install build-essential

COPY package.json ./
COPY hardhat.config.ts ./
COPY yarn.lock ./
RUN yarn install

ENV NODE_OPTIONS="--max-old-space-size=2048"

COPY . .
