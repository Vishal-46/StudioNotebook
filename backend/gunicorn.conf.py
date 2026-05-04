# Gunicorn configuration file
import multiprocessing

bind = "0.0.0.0:10000"
workers = multiprocessing.cpu_count() * 2 + 1
threads = 2
timeout = 120
accesslog = "-"
errorlog = "-"
capture_output = True
enable_stdio_inheritance = True
