from django.contrib import admin
from .models import PaymentIntent

@admin.register(PaymentIntent)
class PaymentIntentAdmin(admin.ModelAdmin):
    list_display = ("public_id", "user", "amount", "status", "gateway", "created_at")
    list_filter = ("gateway", "status", "created_at")
    search_fields = ("public_id", "ref_id", "token")
