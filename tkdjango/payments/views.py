# payments/views.py
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.conf import settings
from .models import PaymentIntent
from .gateways import get_gateway

class InitiatePaymentView(APIView):
    """در صورت نیاز به شروع پرداخت مستقل از مسابقه (فعلاً استفاده نمی‌کنیم)"""
    def post(self, request):
        return Response({"detail": "use competition endpoint"}, status=400)

class GatewayCallbackView(APIView):
    """اگر بعداً callback سمت بک‌اند بخواهی"""
    def get(self, request, gateway_name="fake"):
        pid = request.GET.get("pid")
        if not pid:
            return Response({"detail": "pid required"}, status=400)

        try:
            intent = PaymentIntent.objects.get(public_id=pid)
        except PaymentIntent.DoesNotExist:
            return Response({"detail": "intent not found"}, status=404)

        gw = get_gateway(gateway_name)
        # در حالت فیک، ok=True
        res = gw.verify(request)
        if res.get("ok"):
            intent.status = "paid"
            intent.ref_id = res.get("ref_id", "")
            intent.card_pan = res.get("card_pan", "")
            intent.save(update_fields=["status","ref_id","card_pan","updated_at"])
            return_url = intent.callback_url or settings.PAYMENTS.get("RETURN_URL")
            return Response({"ok": True, "redirect": return_url}, status=200)
        else:
            intent.status = "failed"
            intent.save(update_fields=["status","updated_at"])
            return Response({"ok": False}, status=200)
