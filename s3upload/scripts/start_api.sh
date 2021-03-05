#!/bin/bash

BASE="/node/s3upload"

# First run of the deployment doesn't get to use the stop_api.sh script.
# As such. we need to kill the current listening node process
if [[ $(netstat -nalpt | grep -c "^tcp.*:80 .*LISTEN .*node") -gt 0 ]]; then
    # Kill node from netstat listing
    netstat -nalpt | grep "^tcp.*:80 .*LISTEN .*node" | awk '{print $7}' | cut -d'/' -f1 | while read PID; do
        kill -9  $PID
    done
fi

# Provide node with our region in an environment variable
AWS_REGION=$(curl --silent http://169.254.169.254/latest/meta-data/placement/region)
export AWS_REGION

cd $BASE
npm start >/var/log/s3upload.log 2>&1 &