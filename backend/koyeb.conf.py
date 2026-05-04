# Koyeb specific configuration
import multiprocessing
import os

port = os.getenv("PORT", "8000")
bind = f"0.0.0.0:{port}"
workers = 2 # Keeping it lean for free tier
threads = 2
timeout = 120
accesslog = "-"
errorlog = "-"
capture_output = True
