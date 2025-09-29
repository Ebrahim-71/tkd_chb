from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

from accounts.views import mini_profile

urlpatterns = [
    # -------- Admin / Reports --------
    path("admin/reports/", include("reports.urls")),
    path("admin/", admin.site.urls),

    # -------- API --------
    # auth-specific minis should come BEFORE accounts include to avoid overlap
    path("api/auth/profile/mini/", mini_profile, name="profile-mini"),
    path("api/auth/", include(("accounts.urls", "accounts"), namespace="accounts")),

    path("api/competitions/", include(("competitions.urls", "competitions"), namespace="competitions")),
    path("api/payments/", include(("payments.urls", "payments"), namespace="payments")),
    path("api/", include(("main.urls", "main"), namespace="main")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
