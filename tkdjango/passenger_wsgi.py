import os
import sys

# مسیر پروژه Django
sys.path.insert(0, os.path.dirname(__file__))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "tkdjango.settings")  # ← اسم پروژه

from django.core.wsgi import get_wsgi_application
application = get_wsgi_application()
