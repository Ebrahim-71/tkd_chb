from django.db import models
from django.utils import timezone
from django.conf import settings
from django.contrib.auth import get_user_model

User = get_user_model()

# -----------------------------
# ۱. مدل هیئت
# -----------------------------
class TkdBoard(models.Model):
    name = models.CharField(max_length=100)
    province = models.CharField(max_length=100)
    city = models.CharField(max_length=100)
    user = models.OneToOneField(User, on_delete=models.CASCADE, null=True, blank=True)
    ranking_total = models.FloatField(default=0)
    def __str__(self):
        return self.name

    class Meta:
        verbose_name = "هیئت"
        verbose_name_plural = "\u200b\u200c\u200c\u200cهیئت‌ها"  # بعد از باشگاه‌ها


# -----------------------------
# ۲. مدل باشگاه
# -----------------------------
class TkdClub(models.Model):
    club_name = models.CharField(max_length=100, unique=True, verbose_name="نام باشگاه")
    founder_name = models.CharField(max_length=100, verbose_name="نام موسس")
    founder_national_code = models.CharField(max_length=10, verbose_name="کد ملی موسس")
    founder_phone = models.CharField(max_length=15, verbose_name="شماره موبایل موسس", db_index=True)
    province = models.CharField(max_length=100)
    county = models.CharField(max_length=100)
    city = models.CharField(max_length=100)

    tkd_board = models.ForeignKey(TkdBoard, on_delete=models.SET_NULL, null=True, related_name='clubs')

    license_number = models.CharField(max_length=100)
    federation_id = models.CharField(max_length=100)

    CLUB_TYPE_CHOICES = [
        ('private', 'خصوصی'),
        ('governmental', 'دولتی'),
        ('other', 'سایر'),
    ]
    club_type = models.CharField(max_length=20, choices=CLUB_TYPE_CHOICES)

    phone = models.CharField(max_length=15)
    address = models.TextField()
    activity_description = models.TextField(blank=True, null=True)
    license_image = models.ImageField(upload_to='club_licenses/')
    confirm_info = models.BooleanField(default=False)

    coach_count = models.PositiveIntegerField(default=0)
    student_count = models.PositiveIntegerField(default=0)
    matches_participated = models.PositiveIntegerField(default=0)

    gold_medals = models.PositiveIntegerField(default=0)
    silver_medals = models.PositiveIntegerField(default=0)
    bronze_medals = models.PositiveIntegerField(default=0)

    ranking_competition = models.FloatField(default=0)
    ranking_total = models.FloatField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    user = models.OneToOneField(User, on_delete=models.CASCADE, null=True, blank=True)
    def __str__(self):
        return self.club_name

    class Meta:
        verbose_name = "باشگاه"
        verbose_name_plural = "\u200b\u200b\u200cباشگاه‌ها"


# models.py

class PendingClub(models.Model):
    club_name = models.CharField(max_length=100, unique=True, verbose_name="نام باشگاه")
    founder_name = models.CharField(max_length=100)
    founder_national_code = models.CharField(max_length=10)
    founder_phone = models.CharField(max_length=15)
    club_type = models.CharField(max_length=20, choices=[
        ('private', 'خصوصی'),
        ('governmental', 'دولتی'),
        ('other', 'سایر'),
    ])
    activity_description = models.TextField(blank=True, null=True)

    province = models.CharField(max_length=100)
    county = models.CharField(max_length=100)
    city = models.CharField(max_length=100)
    tkd_board = models.ForeignKey('TkdBoard', on_delete=models.SET_NULL, null=True, related_name='pending_clubs')
    tkd_board_name = models.CharField(max_length=100, blank=True)

    phone = models.CharField(max_length=11)
    address = models.TextField()

    license_number = models.CharField(max_length=100)
    federation_id = models.CharField(max_length=100)
    license_image = models.ImageField(upload_to='club_licenses/')

    confirm_info = models.BooleanField(default=False)
    submitted_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"در انتظار تأیید: {self.club_name}"

    class Meta:
        verbose_name = "تأیید باشگاه"
        verbose_name_plural = "\u200c\u200c\u200c\u200cتأیید باشگاه‌ها"
# -----------------------------
# ۳. مدل پروفایل کاربر تاییدشده
# -----------------------------
class UserProfile(models.Model):
    ROLE_CHOICES = [
        ('player', 'بازیکن'),
        ('coach', 'مربی'),
        ('referee', 'داور'),
        ('both', 'مربی و داور'),
    ]
    GENDER_CHOICES = [('male', 'مرد'), ('female', 'زن')]
    BELT_CHOICES = [ ('سفید', 'سفید'),
        ('زرد', 'زرد'), ('سبز', 'سبز'), ('آبی', 'آبی'), ('قرمز', 'قرمز'),
        *[(f'مشکی دان {i}', f'مشکی دان {i}') for i in range(1, 11)]
    ]
    DEGREE_CHOICES = [
        ('درجه یک', 'درجه یک'), ('درجه دو', 'درجه دو'),
        ('درجه سه', 'درجه سه'), ('ممتاز', 'ممتاز')
    ]
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile', null=True, blank=True)
    first_name = models.CharField(max_length=50)
    last_name = models.CharField(max_length=50)
    father_name = models.CharField(max_length=50)
    national_code = models.CharField(max_length=10, unique=True)
    birth_date = models.CharField(max_length=10, help_text="فرمت: ۱۴۰۳/۰۴/۱۰")
    gender = models.CharField(max_length=10, choices=GENDER_CHOICES)
    phone = models.CharField(max_length=11, unique=True, db_index=True)
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default='player')
    profile_image = models.ImageField(upload_to='player_photos/')
    address = models.TextField()
    province = models.CharField(max_length=50)
    county = models.CharField(max_length=50)
    city = models.CharField(max_length=50)
    tkd_board = models.ForeignKey(TkdBoard, on_delete=models.SET_NULL, null=True)
    tkd_board_name = models.CharField(max_length=255, blank=True)
    coach = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True,
                              limit_choices_to={'is_coach': True}, related_name='students')

    coach_name = models.CharField(max_length=255, blank=True)
    # فیلدهای مربوط به باشگاه
    club = models.ForeignKey(TkdClub, on_delete=models.SET_NULL, null=True, blank=True, related_name='members')

    club_names = models.JSONField(default=list, blank=True)
    coaching_clubs = models.ManyToManyField(TkdClub, blank=True, related_name='coaches')

    belt_grade = models.CharField(max_length=20, choices=BELT_CHOICES)
    belt_certificate_number = models.CharField(max_length=50)
    belt_certificate_date = models.CharField(max_length=10, help_text="فرمت: ۱۴۰۳/۰۴/۱۰")

    is_coach = models.BooleanField(default=False)
    coach_level = models.CharField(max_length=20, choices=DEGREE_CHOICES, null=True, blank=True)
    coach_level_International = models.CharField(max_length=20, choices=DEGREE_CHOICES, null=True, blank=True)

    is_referee = models.BooleanField(default=False)
    kyorogi = models.BooleanField(default=False)
    kyorogi_level = models.CharField(max_length=20, choices=DEGREE_CHOICES, null=True, blank=True)
    kyorogi_level_International = models.CharField(max_length=20, choices=DEGREE_CHOICES, null=True, blank=True)
    poomseh = models.BooleanField(default=False)
    poomseh_level = models.CharField(max_length=20, choices=DEGREE_CHOICES, null=True, blank=True)
    poomseh_level_International = models.CharField(max_length=20, choices=DEGREE_CHOICES, null=True, blank=True)
    hanmadang = models.BooleanField(default=False)
    hanmadang_level = models.CharField(max_length=20, choices=DEGREE_CHOICES, null=True, blank=True)
    hanmadang_level_International = models.CharField(max_length=20, choices=DEGREE_CHOICES, null=True, blank=True)

    match_count = models.PositiveIntegerField(default=0)
    seminar_count = models.PositiveIntegerField(default=0)
    gold_medals = models.PositiveIntegerField(default=0)
    silver_medals = models.PositiveIntegerField(default=0)
    bronze_medals = models.PositiveIntegerField(default=0)

    gold_medals_country= models.PositiveIntegerField(default=0)
    silver_medals_country= models.PositiveIntegerField(default=0)
    bronze_medals_country= models.PositiveIntegerField(default=0)

    gold_medals_int= models.PositiveIntegerField(default=0)
    silver_medals_int= models.PositiveIntegerField(default=0)
    bronze_medals_int= models.PositiveIntegerField(default=0)

    ranking_competition = models.FloatField(default=0)
    ranking_total = models.FloatField(default=0)

    confirm_info = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.first_name} {self.last_name} - {self.phone}"

    class Meta:
        verbose_name = "کاربر"
        verbose_name_plural = " کاربران"
# -----------------------------
# ۴. مدل ثبت‌نام در انتظار تایید
# -----------------------------
class PendingUserProfile(models.Model):
    ROLE_CHOICES = UserProfile.ROLE_CHOICES
    GENDER_CHOICES = UserProfile.GENDER_CHOICES


    first_name = models.CharField(max_length=50)
    last_name = models.CharField(max_length=50)
    father_name = models.CharField(max_length=50)
    national_code = models.CharField(max_length=10, unique=True)
    birth_date = models.CharField(max_length=10, help_text="فرمت: ۱۴۰۳/۰۴/۱۰")
    phone = models.CharField(max_length=11, unique=True)
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default='player')
    gender = models.CharField(max_length=10, choices=GENDER_CHOICES)
    address = models.TextField()
    province = models.CharField(max_length=50)
    county = models.CharField(max_length=50)
    city = models.CharField(max_length=50)
    tkd_board = models.ForeignKey(TkdBoard, on_delete=models.SET_NULL, null=True)
    tkd_board_name = models.CharField(max_length=255, blank=True)
    profile_image = models.ImageField(upload_to='pending_photos/')

    belt_grade = models.CharField(max_length=20, choices=UserProfile.BELT_CHOICES)
    belt_certificate_number = models.CharField(max_length=50)
    belt_certificate_date = models.CharField(max_length=10, help_text="فرمت: ۱۴۰۳/۰۴/۱۰")
    coach_name = models.CharField(max_length=255, blank=True)
    club_names = models.JSONField(default=list, blank=True)

    is_coach = models.BooleanField(default=False)
    coach_level = models.CharField(max_length=20, choices=UserProfile.DEGREE_CHOICES, null=True, blank=True)
    coach_level_International = models.CharField(max_length=20, choices=UserProfile.DEGREE_CHOICES, null=True, blank=True)

    is_referee = models.BooleanField(default=False)
    kyorogi = models.BooleanField(default=False)
    poomseh = models.BooleanField(default=False)
    hanmadang = models.BooleanField(default=False)

    # 🆕 درجه‌های ملی و بین‌المللی داوری:
    kyorogi_level = models.CharField(max_length=20, choices=UserProfile.DEGREE_CHOICES, null=True, blank=True)
    kyorogi_level_International = models.CharField(max_length=20, choices=UserProfile.DEGREE_CHOICES, null=True, blank=True)

    poomseh_level = models.CharField(max_length=20, choices=UserProfile.DEGREE_CHOICES, null=True, blank=True)
    poomseh_level_International = models.CharField(max_length=20, choices=UserProfile.DEGREE_CHOICES, null=True, blank=True)

    hanmadang_level = models.CharField(max_length=20, choices=UserProfile.DEGREE_CHOICES, null=True, blank=True)
    hanmadang_level_International = models.CharField(max_length=20, choices=UserProfile.DEGREE_CHOICES, null=True, blank=True)

    # 🆕 لیست باشگاه‌هایی که مربی هست
    coaching_clubs = models.ManyToManyField(TkdClub, blank=True, related_name='pending_coaches')

    confirm_info = models.BooleanField(default=False)

    coach = models.ForeignKey(
        UserProfile,  # UserProfile
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='pending_students',
        limit_choices_to={'is_coach': True},)

    club = models.ForeignKey(
        TkdClub,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='pending_members'
    )

    submitted_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.first_name} {self.last_name} (در انتظار تأیید)"


# -----------------------------
# ۵. Proxy Models برای پنل ادمین
# -----------------------------
# -----------------------------
# ۵. Proxy Models برای پنل ادمین
# -----------------------------
class PendingEditProfile(models.Model):
    ROLE_CHOICES = UserProfile.ROLE_CHOICES
    GENDER_CHOICES = UserProfile.GENDER_CHOICES
    DEGREE_CHOICES = UserProfile.DEGREE_CHOICES
    BELT_CHOICES = UserProfile.BELT_CHOICES

    original_user = models.OneToOneField(
        UserProfile,
        on_delete=models.CASCADE,
        related_name='edit_request'
    )

    # فیلدهای قابل ویرایش
    first_name = models.CharField(max_length=50)
    last_name = models.CharField(max_length=50)
    father_name = models.CharField(max_length=50)
    national_code = models.CharField(max_length=10, unique=True)
    birth_date = models.CharField(max_length=10, help_text="فرمت: ۱۴۰۳/۰۴/۱۰")
    phone = models.CharField(max_length=11, unique=True)
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default='player')
    gender = models.CharField(max_length=10, choices=GENDER_CHOICES)
    address = models.TextField()
    province = models.CharField(max_length=50)
    county = models.CharField(max_length=50)
    city = models.CharField(max_length=50)
    tkd_board = models.ForeignKey(TkdBoard, on_delete=models.SET_NULL, null=True)
    tkd_board_name = models.CharField(max_length=255, blank=True)
    profile_image = models.ImageField(upload_to='pending_photos/')

    belt_grade = models.CharField(max_length=20, choices=UserProfile.BELT_CHOICES)
    belt_certificate_number = models.CharField(max_length=50)
    belt_certificate_date = models.CharField(max_length=10, help_text="فرمت: ۱۴۰۳/۰۴/۱۰")
    coach_name = models.CharField(max_length=255, blank=True)
    club_names = models.JSONField(default=list, blank=True)

    is_coach = models.BooleanField(default=False)
    coach_level = models.CharField(max_length=20, choices=UserProfile.DEGREE_CHOICES, null=True, blank=True)
    coach_level_International = models.CharField(max_length=20, choices=UserProfile.DEGREE_CHOICES, null=True,
                                                 blank=True)

    is_referee = models.BooleanField(default=False)
    kyorogi = models.BooleanField(default=False)
    poomseh = models.BooleanField(default=False)
    hanmadang = models.BooleanField(default=False)

    # 🆕 درجه‌های ملی و بین‌المللی داوری:
    kyorogi_level = models.CharField(max_length=20, choices=UserProfile.DEGREE_CHOICES, null=True, blank=True)
    kyorogi_level_International = models.CharField(max_length=20, choices=UserProfile.DEGREE_CHOICES, null=True,
                                                   blank=True)

    poomseh_level = models.CharField(max_length=20, choices=UserProfile.DEGREE_CHOICES, null=True, blank=True)
    poomseh_level_International = models.CharField(max_length=20, choices=UserProfile.DEGREE_CHOICES, null=True,
                                                   blank=True)

    hanmadang_level = models.CharField(max_length=20, choices=UserProfile.DEGREE_CHOICES, null=True, blank=True)
    hanmadang_level_International = models.CharField(max_length=20, choices=UserProfile.DEGREE_CHOICES, null=True,
                                                     blank=True)



    confirm_info = models.BooleanField(default=False)

    coach = models.ForeignKey(
        UserProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='pending_edit_students',  # ← تغییر داده شده
        limit_choices_to={'is_coach': True}
    )

    club = models.ForeignKey(
        TkdClub,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='pending_edit_members'  # ← تغییر داده شده
    )

    coaching_clubs = models.ManyToManyField(
        TkdClub,
        blank=True,
        related_name='pending_edit_coaches'  # ← تغییر داده شده
    )

    submitted_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"ویرایش {self.original_user} - در انتظار تأیید"

    class Meta:
        verbose_name = "درخواست ویرایش"
        verbose_name_plural = "\u200c\u200c\u200c\u200c\u200c درخواست‌های ویرایش"






class ApprovedPlayer(UserProfile):
    class Meta:
        proxy = True
        verbose_name = "بازیکن"
        verbose_name_plural = "بازیکنان"

class ApprovedCoach(UserProfile):
    class Meta:
        proxy = True
        verbose_name = "مربی"
        verbose_name_plural = "\u200bمربی‌ها"  # جلوتر از داوران قرار بگیره

class ApprovedReferee(UserProfile):
    class Meta:
        proxy = True
        verbose_name = "داور"
        verbose_name_plural ="\u200b\u200bداوران"  # بعد از مربی‌ها



class PendingPlayer(PendingUserProfile):
    class Meta:
        proxy = True
        verbose_name = "تأیید بازیکن"
        verbose_name_plural = "\u200cتأیید بازیکنان"

class PendingCoach(PendingUserProfile):
    class Meta:
        proxy = True
        verbose_name = "تأیید مربی"
        verbose_name_plural = "\u200c\u200cتأیید مربی‌ها"

class PendingReferee(PendingUserProfile):
    class Meta:
        proxy = True
        verbose_name = "تأیید داور"
        verbose_name_plural = "\u200c\u200c\u200cتأیید داوران"




# -----------------------------
# ۶. تایید پیامک
# -----------------------------
class SMSVerification(models.Model):
    phone = models.CharField(max_length=11)
    code = models.CharField(max_length=4)
    created_at = models.DateTimeField(auto_now_add=True)

    def is_expired(self):
        return (timezone.now() - self.created_at).seconds > 300  # 5 دقیقه



class CoachClubRequest(models.Model):
    STATUS_CHOICES = [
        ('pending', 'در انتظار'),
        ('accepted', 'تأیید شده'),
        ('rejected', 'رد شده'),
    ]
    REQUEST_TYPE_CHOICES = [
        ('add', 'افزودن'),
        ('remove', 'حذف'),
    ]

    coach = models.ForeignKey(UserProfile, on_delete=models.CASCADE, related_name='club_requests')
    club = models.ForeignKey(TkdClub, on_delete=models.CASCADE)
    request_type = models.CharField(max_length=10, choices=REQUEST_TYPE_CHOICES)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('coach', 'club', 'request_type')
