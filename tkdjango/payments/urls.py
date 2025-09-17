# payments/urls.py
from django.urls import path
from .views import InitiatePaymentView, GatewayCallbackView

app_name = "payments"

urlpatterns = [
    path("init/", InitiatePaymentView.as_view(), name="init"),
    path("callback/<str:gateway_name>/", GatewayCallbackView.as_view(), name="callback"),
]
