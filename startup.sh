#!/bin/bash

# Azure App Service Linux startup script for JR Ticket System

# Environment setup
echo "Starting JR Ticket System on Azure App Service (Linux)"

# Change to backend directory
cd /home/site/wwwroot/backend

# Install Python dependencies if requirements.txt exists
if [ -f "requirements.txt" ]; then
    echo "Installing Python dependencies..."
    pip install -r requirements.txt
fi

# Start the Python application using gunicorn
echo "Starting application with gunicorn..."
gunicorn --bind 0.0.0.0:$PORT --workers 4 --worker-class aiohttp.GunicornWebWorker --timeout 600 app:application
