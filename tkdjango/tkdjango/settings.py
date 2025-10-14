from pathlib import Path
from decouple import config
import os
from datetime import timedelta
from corsheaders.defaults import default_headers

# ─────────────────────────────────────────────
# Base
# ─────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = config("SECRET_KEY")
DEBUG = config("DEBUG", default=False, cast=bool)

ALLOWED_HOSTS = [h for h in config("ALLOWED_HOSTS", default="").split(",") if h] or ["localhost", "127.0.0.1"]

# ─────────────────────────────────────────────
# Installed Apps
# ─────────────────────────────────────────────
INSTALLED_APPS = [
    "corsheaders",                    # فقط یک‌بار
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.humanize",

    "django_jalali",
    "django_extensions",
    "rest_framework",

    "main",
    "reports",
    "accounts",
    "competitions",
    "payments",
]

# ─────────────────────────────────────────────
# Middleware  (ترتیب مطابق داکیومنت CORS)
# ─────────────────────────────────────────────
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",

    "corsheaders.middleware.CorsMiddleware",   # قبل از CommonMiddleware

    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",  # بعد از Session
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

# ─────────────────────────────────────────────
# URLs / WSGI
# ─────────────────────────────────────────────
ROOT_URLCONF = "tkdjango.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "tkdjango.wsgi.application"

# ─────────────────────────────────────────────
# Database
# ─────────────────────────────────────────────
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

# ─────────────────────────────────────────────
# Auth / REST / JWT
# ─────────────────────────────────────────────
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=30),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=1),
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# ─────────────────────────────────────────────
# Internationalization
# ─────────────────────────────────────────────
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# ─────────────────────────────────────────────
# Static & Media
# ─────────────────────────────────────────────
STATIC_URL = "/static/"
STATICFILES_DIRS = [os.path.join(BASE_DIR, "static")]
STATIC_ROOT = os.path.join(BASE_DIR, "staticfiles")

MEDIA_URL = "/media/"
MEDIA_ROOT = os.path.join(BASE_DIR, "media")

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ─────────────────────────────────────────────
# Jalali
# ─────────────────────────────────────────────
JALALI_DATE_DEFAULTS = {
    "Strftime": {
        "date": "%Y/%m/%d",
        "datetime": "%Y/%m/%d _ %H:%M:%S",
    },
    "Static": {"js": [], "css": {"all": []}},
}

# ─────────────────────────────────────────────
# CORS / CSRF
# ─────────────────────────────────────────────
# برای توسعه:
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
]
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = list(default_headers) + [
    "x-role-group",          # هدر سفارشی که از فرانت می‌فرستی
]

CSRF_TRUSTED_ORIGINS = [
    "http://localhost:3000",
]

# ─────────────────────────────────────────────
# Payments (حالت آزمایشی)
# ─────────────────────────────────────────────
PAYMENTS = {
    "DEFAULT_GATEWAY": "fake",
    "RETURN_URL": "http://localhost:3000/payment/result",
    "CALLBACK_BASE": "http://localhost:8000/api/payments/callback",
    "GATEWAYS": {
        "fake": {},
        # "sadad": {"merchant_id": "...", "terminal_id": "...", "terminal_key": "..."},
    },
}
PAYMENTS_ENABLED = False
PAYMENTS_DUMMY = True

# ─────────────────────────────────────────────
# سایر
# ─────────────────────────────────────────────
POOMSAE_ALLOW_TEST_REG = True
SMS_DRY_RUN = True
