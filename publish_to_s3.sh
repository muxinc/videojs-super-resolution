#!/bin/bash

set -e

S3_BUCKET=$1

aws s3 sync . "s3://${S3_BUCKET}" --delete \
  --exclude "*" \
  --include "index.html" \
  --include "dist/*" \
  --include "weights/*" \
  --include "public/*"
