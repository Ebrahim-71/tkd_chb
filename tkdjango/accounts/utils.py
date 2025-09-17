#from zeep import Client
#from decouple import config

#def send_verification_code(phone, code):
 #   username = config('MELIPAYAMAK_USERNAME')
  #  password = config('MELIPAYAMAK_PASSWORD')
   # body_id = int(config('MELIPAYAMAK_BODY_ID'))
    #text = [str(code)]

    #try:
     #   client = Client('http://api.payamak-panel.com/post/send.asmx?wsdl')
      #  result = client.service.SendByBaseNumber(
       #     username=username,
        #    password=password,
         #   text=text,
          #  to=phone,
           # bodyId=body_id
#        )
#        return result
 #   except Exception as e:
 #       print(f"[ERROR] ارسال پیامک ناموفق بود: {e}")
  #      return None
# accounts/utils.py
import logging
from django.conf import settings
from decouple import config

logger = logging.getLogger(__name__)

def send_verification_code(phone: str, code: str) -> bool:
    """
    در حالت لوکال/تست (DEBUG یا SMS_DRY_RUN):
      - پیامک واقعی ارسال نمی‌شود
      - کد در لاگ/کنسول چاپ می‌شود
      - True برمی‌گرداند

    در حالت پروداکشن:
      - با Melipayamak ارسال می‌شود
      - True/False بر اساس موفقیت ارسال
    """
    dry = getattr(settings, "SMS_DRY_RUN", False) or getattr(settings, "DEBUG", False)
    if dry:
        msg = f"[DEV SMS] OTP for {phone}: {code}"
        logger.warning(msg)
        print(msg)
        return True

    # --- ارسال واقعی با Payamak Panel ---
    try:
        from zeep import Client  # import داخل try تا در لوکال هم وابستگی لازم نباشه
        username = config("MELIPAYAMAK_USERNAME", default=None)
        password = config("MELIPAYAMAK_PASSWORD", default=None)
        body_id  = config("MELIPAYAMAK_BODY_ID", default=None, cast=int)

        if not (username and password and body_id):
            logger.error("SMS credentials are missing. Set MELIPAYAMAK_* env vars.")
            return False

        client = Client("http://api.payamak-panel.com/post/send.asmx?wsdl")
        # توجه: این وب‌سرویس بر اساس قالبِ BodyId فقط متن‌اش را از سامانه می‌گیرد؛
        # پس text باید آرایه‌ای از جایگزین‌ها باشد. اینجا فقط 'code' را می‌فرستیم.
        result = client.service.SendByBaseNumber(
            username=username,
            password=password,
            text=[str(code)],
            to=phone,
            bodyId=body_id,
        )
        # اگر لازم داری نتیجه‌ی دقیق را بررسی کنی، اینجا بر اساس داکیومنت سرویس چک کن.
        logger.info("SMS sent via provider. result=%s", result)
        return True
    except Exception as e:
        logger.exception("SMS provider error: %s", e)
        return False
