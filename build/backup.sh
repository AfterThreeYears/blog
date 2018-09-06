#!/bin/bash

rsync -av --exclude-from=./exclude.list ./ mai:/tmp/blog