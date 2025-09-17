# payments/models.py
from django.db import models
from django.contrib.auth import get_user_model
from competitions.models import KyorugiCompetition
import secrets, string

User = get_user_model()

def _gen_public_id(n: int = 12) -> str:
    alphabet = string.ascii_lowercase + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(n))

class PaymentIntent(models.Model):
    GATEWAY_CHOICES = [
        ("sadad", "سداد (بانک ملّی)"),
        ("fake", "درگاه آزمایشی"),
    ]
    STATUS_CHOICES = [
        ("initiated", "ایجاد شده"),
        ("redirected", "ارسال به درگاه"),
        ("paid", "پرداخت موفق"),
        ("failed", "ناموفق/لغو"),
    ]

    public_id = models.CharField(max_length=16, unique=True, db_index=True, default=_gen_public_id, editable=False)
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="payment_intents")
    gateway = models.CharField(max_length=20, choices=GATEWAY_CHOICES, default="fake")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="initiated")

    # هدف پرداخت (فعلاً مسابقه‌ی کیوروگی؛ بعداً می‌تونی جنریکش کنی)
    competition = models.ForeignKey(
        KyorugiCompetition, null=True, blank=True, on_delete=models.SET_NULL, related_name="payment_intents"
    )

    amount = models.PositiveIntegerField(default=0)  # مبلغ (تومان)
    description = models.CharField(max_length=255, blank=True, default="")
    callback_url = models.URLField(blank=True, default="")  # برگشت به فرانت (صفحه نتیجه)

    # داده‌های درگاه
    token = models.CharField(max_length=128, blank=True, default="")   # توکن/Authority
    ref_id = models.CharField(max_length=64, blank=True, default="")   # کد پیگیری بانک
    card_pan = models.CharField(max_length=64, blank=True, default="") # ماسک کارت
    extra = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "تراکنش/Intent"
        verbose_name_plural = "تراکنش‌ها"

    def __str__(self):
        return f"{self.public_id} - {self.amount} - {self.status}"

    @property
    def is_paid(self) -> bool:
        return self.status == "paid"
