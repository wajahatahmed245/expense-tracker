#!/bin/sh
set -e
python seed.py
exec gunicorn app:app \
  --bind 0.0.0.0:5000 \
  --workers 2 \
  --timeout 60 \
  --access-logfile - \
  --error-logfile -
