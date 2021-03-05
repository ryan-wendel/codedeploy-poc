#!/bin/bash

# Kill node from netstat listing
netstat -nalpt | grep "^tcp.*:80 .*LISTEN .*node" | awk '{print $7}' | cut -d'/' -f1 | while read PID; do kill -9  $PID; done