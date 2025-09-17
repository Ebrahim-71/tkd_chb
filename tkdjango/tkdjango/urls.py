from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from accounts.views import mini_profile
# project/urls.py
urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include(('accounts.urls','accounts'), namespace='accounts')),
    path('api/competitions/', include('competitions.urls', namespace='competitions')),
    path("api/payments/", include("payments.urls", namespace="payments")),
    path('api/', include(('main.urls','main'), namespace='main')),
    path("api/auth/profile/mini/", mini_profile, name="profile-mini"),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

