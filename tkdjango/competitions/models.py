# -*- coding: utf-8 -*-
from __future__ import annotations
from django.db import models, transaction, IntegrityError
from django.core.validators import MinValueValidator
from django.core.exceptions import ValidationError
from datetime import timedelta
import random
import string, secrets, jdatetime
from django.db.models import Index, CheckConstraint, Q, F

from django.utils import timezone

from typing import List, Optional


from accounts.models import UserProfile, TkdClub, TkdBoard

from django.conf import settings




# =========================
# ابزار
# =========================
def _gen_public_id(n: int = 10) -> str:
    """شناسه عمومی تصادفی حروف کوچک + رقم (برای URL عمومی)."""
    alphabet = string.ascii_lowercase + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(n))


# =========================
# فرهنگ‌ها / قالب‌ها
# =========================
class AgeCategory(models.Model):
    name = models.CharField('عنوان رده سنی', max_length=100)
    from_date = models.DateField('از تاریخ تولد')
    to_date = models.DateField('تا تاریخ تولد')

    class Meta:
        verbose_name = 'رده سنی'
        verbose_name_plural = 'رده‌های سنی'

    def __str__(self):
        return self.name


class Belt(models.Model):
    name = models.CharField('نام کمربند', max_length=50)

    class Meta:
        verbose_name = 'کمربند'
        verbose_name_plural = 'کمربندها'

    def __str__(self):
        return self.name


class BeltGroup(models.Model):
    label = models.CharField('نام گروه کمربند', max_length=100)
    belts = models.ManyToManyField(Belt, verbose_name='کمربندها')

    class Meta:
        verbose_name = 'گروه کمربند'
        verbose_name_plural = 'گروه‌های کمربند'

    def __str__(self):
        return self.label


class TermsTemplate(models.Model):
    title = models.CharField("عنوان تعهدنامه", max_length=200)
    content = models.TextField("متن تعهدنامه")

    class Meta:
        verbose_name = "قالب تعهدنامه"
        verbose_name_plural = "قالب‌های تعهدنامه"

    def __str__(self):
        return self.title


class WeightCategory(models.Model):
    GENDER_CHOICES = [('male', 'مرد'), ('female', 'زن')]

    name = models.CharField('نام وزن', max_length=50)
    gender = models.CharField('جنسیت', max_length=6, choices=GENDER_CHOICES)
    min_weight = models.FloatField('حداقل وزن (kg)')
    max_weight = models.FloatField('حداکثر وزن (kg)')
    tolerance  = models.FloatField('میزان ارفاق وزنی (kg)', default=0.2)

    class Meta:
        verbose_name = 'رده وزنی'
        verbose_name_plural = 'رده‌های وزنی'

    def __str__(self):
        g = dict(self.GENDER_CHOICES).get(self.gender, self.gender)
        return f"{self.name} ({self.min_weight}–{self.max_weight} kg) - {g}"

    def includes_weight(self, weight: float) -> bool:
        return self.min_weight <= weight <= (self.max_weight + self.tolerance)


# =========================
# مسابقه کیوروگی
# =========================
class KyorugiCompetition(models.Model):
    GENDER_CHOICES = [('male', 'آقایان'), ('female', 'بانوان')]
    BELT_LEVEL_CHOICES = [
        ('yellow_blue', 'زرد تا آبی'),
        ('red_black', 'قرمز و مشکی'),
        ('all', 'همه رده‌ها'),
    ]

    title = models.CharField('عنوان مسابقه', max_length=255)
    poster = models.ImageField('پوستر شاخص', upload_to='kyorugi_posters/', null=True, blank=True)
    entry_fee = models.PositiveIntegerField('مبلغ ورودی (تومان)', default=0, validators=[MinValueValidator(0)])

    age_category = models.ForeignKey(AgeCategory, verbose_name='رده سنی',
                                     on_delete=models.SET_NULL, null=True)
    belt_level = models.CharField('رده کمربندی', max_length=20, choices=BELT_LEVEL_CHOICES)
    belt_groups = models.ManyToManyField(BeltGroup, verbose_name='گروه‌های کمربندی', blank=True)
    gender = models.CharField('جنسیت', max_length=10, choices=GENDER_CHOICES)

    city = models.CharField('شهر محل برگزاری', max_length=100)
    address = models.TextField('آدرس محل برگزاری')

    registration_start = models.DateField(verbose_name='شروع ثبت‌نام')
    registration_end   = models.DateField(verbose_name='پایان ثبت‌نام')
    weigh_date         = models.DateField(verbose_name='تاریخ وزن‌کشی')
    draw_date          = models.DateField(verbose_name='تاریخ قرعه‌کشی')
    competition_date   = models.DateField(verbose_name='تاریخ برگزاری')

    mat_count = models.PositiveIntegerField('تعداد زمین', default=1)
    registration_open = models.BooleanField('فعال بودن ثبت‌نام', default=False)

    terms_template = models.ForeignKey(
        TermsTemplate,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="قالب تعهدنامه",
        related_name='competitions'
    )

    created_at = models.DateTimeField(auto_now_add=True)

    public_id = models.CharField(
        'شناسه عمومی',
        max_length=16,
        unique=True,
        db_index=True,
        editable=False,
        default=_gen_public_id,
    )

    class Meta:
        verbose_name = 'مسابقه کیوروگی'
        verbose_name_plural = 'مسابقات کیوروگی'
        constraints = [
            models.CheckConstraint(
                check=Q(registration_start__lte=F('registration_end')),
                name='reg_start_lte_reg_end'
            ),
            models.CheckConstraint(
                check=Q(weigh_date__lte=F('draw_date')),
                name='weigh_lte_draw'
            ),
            models.CheckConstraint(
                check=Q(draw_date__lte=F('competition_date')),
                name='draw_lte_comp'
            ),
        ]
        indexes = [
            models.Index(fields=['public_id']),
            models.Index(fields=['competition_date']),
        ]

    def __str__(self):
        return self.title

    @property
    def style_display(self):
        return "کیوروگی"

    def clean(self):
        # اگر کاربر در ادمین تاریخ شمسی وارد کرد (سال < 1700)، به میلادی تبدیل کن
        for f in ["registration_start", "registration_end", "weigh_date", "draw_date", "competition_date"]:
            d = getattr(self, f)
            if d and d.year < 1700:
                setattr(self, f, jdatetime.date(d.year, d.month, d.day).togregorian())
        super().clean()

    def save(self, *args, **kwargs):
        attempts = 5
        while attempts > 0:
            try:
                if not self.public_id:
                    self.public_id = _gen_public_id(10)
                return super().save(*args, **kwargs)
            except IntegrityError as e:
                if 'public_id' in str(e).lower():
                    self.public_id = _gen_public_id(10)
                    attempts -= 1
                    continue
                raise
        raise IntegrityError("عدم امکان ایجاد شناسهٔ عمومی یکتا برای مسابقه.")

    # اوزان مجاز این مسابقه از روی تخصیص زمین‌ها
    def allowed_weight_ids(self) -> set[int]:
        return set(
            self.mat_assignments.values_list('weights__id', flat=True)
        )


# =========================
# سایر موجودیت‌های مسابقه
# =========================
class MatAssignment(models.Model):
    competition = models.ForeignKey(
        KyorugiCompetition,
        verbose_name='مسابقه',
        on_delete=models.CASCADE,
        related_name='mat_assignments'
    )
    mat_number = models.PositiveIntegerField('شماره زمین')
    weights = models.ManyToManyField(WeightCategory, verbose_name='اوزان تخصیص‌یافته')

    class Meta:
        verbose_name = 'تخصیص زمین'
        verbose_name_plural = 'تخصیص اوزان به زمین‌ها'

    def __str__(self):
        return f'زمین {self.mat_number} - {self.competition.title}'


class CompetitionImage(models.Model):
    competition = models.ForeignKey(
        KyorugiCompetition,
        related_name='images',
        on_delete=models.CASCADE,
        verbose_name='مسابقه'
    )
    image = models.ImageField('تصویر پیوست', upload_to='kyorugi_images/')

    class Meta:
        verbose_name = 'تصویر مسابقه'
        verbose_name_plural = 'تصاویر مسابقه'

    def __str__(self):
        return f"تصویر - {self.competition.title}"


class CompetitionFile(models.Model):
    competition = models.ForeignKey(
        KyorugiCompetition,
        related_name='files',
        on_delete=models.CASCADE,
        verbose_name='مسابقه'
    )
    file = models.FileField('فایل PDF', upload_to='kyorugi_files/')

    class Meta:
        verbose_name = 'فایل مسابقه'
        verbose_name_plural = 'فایل‌های مسابقه'

    def __str__(self):
        return f"فایل - {self.competition.title}"


class CoachApproval(models.Model):
    competition = models.ForeignKey(
        'competitions.KyorugiCompetition',
        on_delete=models.CASCADE,
        related_name='coach_approvals',
        verbose_name='مسابقه'
    )
    coach = models.ForeignKey(
        'accounts.UserProfile',
        on_delete=models.CASCADE,
        limit_choices_to={'is_coach': True},
        related_name='competition_approvals',
        verbose_name='مربی'
    )
    code = models.CharField(
        'کد تأیید مربی',
        max_length=8,
        blank=True,
        null=True,
        db_index=True
    )
    terms_accepted = models.BooleanField('تعهدنامه پذیرفته شد', default=False)
    is_active = models.BooleanField('فعال', default=True)
    approved_at = models.DateTimeField('تاریخ تأیید', auto_now_add=True)

    class Meta:
        verbose_name = 'تأیید مربی برای مسابقه'
        verbose_name_plural = 'تأییدهای مربیان'
        constraints = [
            models.UniqueConstraint(
                fields=['competition', 'coach'],
                name='uniq_competition_coach'
            ),
            # یکتا وقتی کد نال نیست
            models.UniqueConstraint(
                fields=['competition', 'code'],
                condition=models.Q(code__isnull=False),
                name='uniq_competition_code'
            ),
        ]
        # ایندکس کاربردی برای فیلترهای متداول
        indexes = [
            models.Index(fields=['competition', 'is_active', 'terms_accepted']),
        ]

    def __str__(self):
        fn = getattr(self.coach, 'first_name', '') or ''
        ln = getattr(self.coach, 'last_name', '') or ''
        return f"{self.competition} - {fn} {ln}".strip()

    @staticmethod
    def _rand_code(length: int = 6) -> str:
        """تولید کد عددی با طول ثابت (پیش‌فرض: ۶ رقم)."""
        import random
        upper = 10**length - 1
        return f"{random.randint(0, upper):0{length}d}"

    @transaction.atomic
    def set_fresh_code(self, save: bool = True, force: bool = False) -> str:
        """
        اگر قبلاً کد دارد و force=False باشد، همان کد را برمی‌گرداند.
        اگر force=True باشد، «به‌اجبار» کد جدید و یکتا (در سطح همان مسابقه) می‌سازد.
        """
        # اگر کد داریم و اصراری به تغییر نیست، برگردان
        if self.code and not force:
            return self.code

        # قفل رکورد برای جلوگیری از رقابت
        current = CoachApproval.objects.select_for_update().get(pk=self.pk)

        # اگر بعد از قفل هنوز کد دارد و force=False، همان را بده
        if current.code and not force:
            return current.code

        # پیدا کردن کد یکتا
        for _ in range(25):
            c = self._rand_code(6)  # ۶ رقمی
            exists = CoachApproval.objects.filter(
                competition=self.competition, code=c
            ).exists()
            if not exists:
                current.code = c
                if save:
                    # اجازهٔ تغییر کد فقط از این مسیر
                    setattr(current, "_allow_code_change", True)
                    current.save(update_fields=['code'])
                    delattr(current, "_allow_code_change")
                return c

        raise ValueError("ساخت کد یکتا ممکن نشد، دوباره تلاش کنید.")

    def clean(self):
        """اعتبارسنجی اختیاری: اگر کد هست، فقط رقم و ۴ تا ۸ رقم."""
        from django.core.exceptions import ValidationError
        import re as _re
        if self.code:
            if not _re.fullmatch(r"\d{4,8}", str(self.code)):
                raise ValidationError({"code": "کد باید عددی و بین ۴ تا ۸ رقم باشد."})
        super().clean()

    def save(self, *args, **kwargs):
        """
        جلوگیری از تغییر کد پس از اولین بار (immutable)،
        مگر وقتی از متد set_fresh_code با فلگ داخلی اجازه داده شود.
        """
        if self.pk is not None:
            try:
                orig_code = CoachApproval.objects.filter(pk=self.pk).values_list('code', flat=True).first()
            except CoachApproval.DoesNotExist:
                orig_code = None

            # اگر قبلاً کد داشته و الان عوض شده ولی فلگ مجاز نیست → خطا
            if orig_code and self.code != orig_code and not getattr(self, "_allow_code_change", False):
                from django.core.exceptions import ValidationError
                raise ValidationError({"code": "تغییر کد مجاز نیست. فقط مدیر می‌تواند کد جدید تولید کند."})

        return super().save(*args, **kwargs)

# =========================
# ثبت‌نام بازیکن (Enrollment)
# =========================

class Enrollment(models.Model):
    MEDAL_CHOICES = [
        ("", "—"),
        ("gold", "طلا"),
        ("silver", "نقره"),
        ("bronze", "برنز"),]

    STATUS_CHOICES = [
        ("pending_payment", "در انتظار پرداخت"),
        ("paid", "پرداخت‌شده"),
        ("confirmed", "تأیید نهایی"),
        ("accepted", "پذیرفته‌شده"),
        ("completed", "تکمیل‌شده"),
        ("canceled", "لغو شده"),
    ]

    competition = models.ForeignKey(
        "competitions.KyorugiCompetition",
        on_delete=models.CASCADE,
        related_name="enrollments",
    )
    player = models.ForeignKey(
        UserProfile, on_delete=models.PROTECT, related_name="enrollments"
    )

    # مربی + اسنپ‌شات
    coach = models.ForeignKey(
        UserProfile,
        on_delete=models.SET_NULL, null=True, blank=True,
        related_name="coach_enrollments",
        limit_choices_to={"is_coach": True},
    )
    coach_name = models.CharField(max_length=150, blank=True, default="")
    coach_approval_code = models.CharField(max_length=8, blank=True, default="")

    # باشگاه/هیئت: FK + اسنپ‌شات نام
    club = models.ForeignKey(
        TkdClub, on_delete=models.SET_NULL, null=True, blank=True, related_name="club_enrollments"
    )
    club_name = models.CharField(max_length=150, blank=True, default="")
    board = models.ForeignKey(
        TkdBoard, on_delete=models.SET_NULL, null=True, blank=True, related_name="board_enrollments"
    )
    board_name = models.CharField(max_length=150, blank=True, default="")

    # گروه کمربندی/رده وزنی
    belt_group = models.ForeignKey(
        "competitions.BeltGroup", on_delete=models.SET_NULL, null=True, blank=True, related_name="enrollments"
    )
    weight_category = models.ForeignKey(
        "competitions.WeightCategory", on_delete=models.PROTECT, null=True, blank=True, related_name="enrollments"
    )

    # داده‌های فرم
    declared_weight = models.FloatField(validators=[MinValueValidator(0.0)])
    insurance_number = models.CharField(max_length=20)
    insurance_issue_date = models.DateField()

    # پرداخت
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending_payment")
    is_paid = models.BooleanField(default=False)
    paid_amount = models.PositiveIntegerField(default=0)  # تومان
    bank_ref_code = models.CharField(max_length=64, blank=True, default="")
    paid_at = models.DateTimeField(null=True, blank=True)
    medal = models.CharField(max_length=10, choices=MEDAL_CHOICES, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["competition", "status"]),
            models.Index(fields=["coach"]),
            models.Index(fields=["club"]),
            models.Index(fields=["board"]),
        ]

    def __str__(self):
        return f"{self.player} @ {self.competition}"

    # models.py (داخل کلاس Enrollment)
    def mark_paid(self, amount: int = 0, ref_code: str = ""):
        was_paid = self.is_paid  # ← قبل از تغییر
        self.is_paid = True
        self.paid_amount = int(amount or 0)
        if ref_code:
            self.bank_ref_code = ref_code
        self.paid_at = timezone.now()
        if self.status in ("pending_payment", "canceled", ""):
            self.status = "paid"
        super().save(update_fields=["is_paid", "paid_amount", "bank_ref_code", "paid_at", "status"])

        # ✅ فقط دفعه‌ی اول که از unpaid → paid می‌رویم، امتیاز بده
        if not was_paid:
            # بازیکن: +1 مسابقه
            try:
                UserProfile.objects.filter(id=self.player_id).update(
                    ranking_competition=F("ranking_competition") + 1.0,
                    ranking_total=F("ranking_total") + 1.0
                )
            except Exception:
                pass

            # مربی: +0.75 به total
            if self.coach_id:
                UserProfile.objects.filter(id=self.coach_id).update(
                    ranking_total=F("ranking_total") + 0.75
                )

            # باشگاه/هیئت: +0.5 به total
            if self.club_id:
                TkdClub.objects.filter(id=self.club_id).update(
                    ranking_total=F("ranking_total") + 0.5
                )
            if self.board_id:
                TkdBoard.objects.filter(id=self.board_id).update(
                    ranking_total=F("ranking_total") + 0.5
                )


class Draw(models.Model):
    """قرعهٔ یک گروه مشخص در یک مسابقه (جنسیت/رده سنی/گروه کمربندی/رده وزنی)."""
    competition = models.ForeignKey(
        "competitions.KyorugiCompetition",
        on_delete=models.CASCADE,
        related_name="draws",
        verbose_name="مسابقه",
    )
    gender = models.CharField("جنسیت", max_length=10)  # male / female
    age_category = models.ForeignKey(
        "competitions.AgeCategory",
        on_delete=models.PROTECT,
        verbose_name="رده سنی",
    )
    belt_group = models.ForeignKey(
        "competitions.BeltGroup",
        on_delete=models.PROTECT,
        verbose_name="گروه کمربندی",
    )
    weight_category = models.ForeignKey(
        "competitions.WeightCategory",
        on_delete=models.PROTECT,
        verbose_name="رده وزنی",
    )

    size = models.PositiveIntegerField("اندازه جدول (توان ۲)", help_text="مثل 8، 16، 32")
    club_threshold = models.PositiveIntegerField("آستانه هم‌باشگاهی", default=8)
    rng_seed = models.CharField("Seed تصادفی", max_length=32, blank=True, default="")
    is_locked = models.BooleanField("قفل شده؟", default=False)
    created_at = models.DateTimeField("ایجاد", auto_now_add=True)

    class Meta:
        verbose_name = "قرعه"
        verbose_name_plural = "قرعه‌ها"
        indexes = [
            models.Index(fields=["competition", "gender", "age_category", "belt_group", "weight_category"]),
        ]
        unique_together = (
            ("competition", "gender", "age_category", "belt_group", "weight_category"),
        )

    def __str__(self):
        return f"قرعه #{self.id} - {self.competition} [{self.gender}/{self.age_category}/{self.belt_group}/{self.weight_category}]"



class Match(models.Model):
    draw = models.ForeignKey(Draw, on_delete=models.CASCADE, related_name="matches", verbose_name="قرعه")
    round_no = models.PositiveIntegerField("دور", help_text="1 = دور اول")
    slot_a = models.PositiveIntegerField("اسلات A")
    slot_b = models.PositiveIntegerField("اسلات B")

    player_a = models.ForeignKey(
        "accounts.UserProfile", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="as_player_a", verbose_name="بازیکن A"
    )
    player_b = models.ForeignKey(
        "accounts.UserProfile", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="as_player_b", verbose_name="بازیکن B"
    )
    is_bye = models.BooleanField("BYE؟", default=False)

    winner = models.ForeignKey(
        "accounts.UserProfile", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="as_winner", verbose_name="برنده"
    )

    # زمینِ اندیشیده‌شده برای وزن (از MatAssignment درآورده می‌شود)
    mat_no = models.PositiveIntegerField("زمین", null=True, blank=True)

    # 🆕 شمارهٔ بازی روی زمین (از 1 شروع می‌شود و پیوسته است)
    match_number = models.PositiveIntegerField("شماره بازی", null=True, blank=True, db_index=True)

    scheduled_at = models.DateTimeField("زمان‌بندی", null=True, blank=True)
    created_at = models.DateTimeField("ایجاد", auto_now_add=True)

    class Meta:
        verbose_name = "مبارزه"
        verbose_name_plural = "مبارزات"
        indexes = [
            models.Index(fields=["draw", "round_no"]),
            models.Index(fields=["mat_no", "match_number"]),
        ]

    def __str__(self):
        return f"M{self.id} R{self.round_no} ({self.slot_a}-{self.slot_b})"
class DrawStart(Draw):
    class Meta:
        proxy = True
        verbose_name = "شروع قرعه‌کشی"
        verbose_name_plural = "شروع قرعه‌کشی"


class FirstRoundPairHistory(models.Model):
    player_a = models.ForeignKey("accounts.UserProfile", on_delete=models.CASCADE, related_name='+')
    player_b = models.ForeignKey("accounts.UserProfile", on_delete=models.CASCADE, related_name='+')

    gender = models.CharField(max_length=10)  # male / female
    age_category = models.ForeignKey("competitions.AgeCategory", on_delete=models.PROTECT)
    belt_group = models.ForeignKey("competitions.BeltGroup", on_delete=models.PROTECT)
    weight_category = models.ForeignKey("competitions.WeightCategory", on_delete=models.PROTECT)

    last_competition = models.ForeignKey("competitions.KyorugiCompetition", on_delete=models.SET_NULL, null=True, blank=True)
    last_met_at = models.DateTimeField(auto_now=True)  # آخرین به‌روزرسانی

    class Meta:
        unique_together = (
            "player_a", "player_b", "gender", "age_category", "belt_group", "weight_category"
        )

    def save(self, *args, **kwargs):
        # نرمال‌سازی ترتیب تا (a,b) و (b,a) تکراری نشوند
        if self.player_a_id and self.player_b_id and self.player_a_id > self.player_b_id:
            self.player_a_id, self.player_b_id = self.player_b_id, self.player_a_id
        super().save(*args, **kwargs)





class RankingAward(models.Model):
    enrollment = models.OneToOneField('Enrollment', on_delete=models.CASCADE, related_name='ranking_award')

    player = models.ForeignKey(UserProfile, null=True, blank=True, on_delete=models.SET_NULL, related_name='awards_as_player')
    coach  = models.ForeignKey(UserProfile, null=True, blank=True, on_delete=models.SET_NULL, related_name='awards_as_coach')
    club   = models.ForeignKey(TkdClub,  null=True, blank=True, on_delete=models.SET_NULL, related_name='awards_as_club')
    board  = models.ForeignKey(TkdBoard, null=True, blank=True, on_delete=models.SET_NULL, related_name='awards_as_board')

    player_name = models.CharField(max_length=255, blank=True)
    coach_name  = models.CharField(max_length=255, blank=True)
    club_name   = models.CharField(max_length=255, blank=True)
    board_name  = models.CharField(max_length=255, blank=True)

    points_player = models.FloatField(default=0.0)
    points_coach  = models.FloatField(default=0.0)
    points_club   = models.FloatField(default=0.0)
    points_board  = models.FloatField(default=0.0)

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Award(enrollment={self.enrollment_id})"


def _award_points_after_payment(enrollment):
    """
    امتیازدهی فقط یک‌بار به ازای هر Enrollment.
    بر اساس اسنپ‌شات‌های ذخیره‌شده روی Enrollment (اگر نبود، از پروفایل فعلی برمی‌داریم).
    """
    # اگر قبلاً برای این ثبت‌نام امتیاز ثبت شده، کاری نکن
    from .models import RankingAward  # import محلی برای پرهیز از حلقه
    if hasattr(enrollment, 'ranking_award'):
        return

    player = enrollment.player

    # اسنپ‌شات‌ها را ترجیح بده
    coach = enrollment.coach or (player.coach if getattr(player, 'coach_id', None) else None)
    club  = enrollment.club  or (player.club  if getattr(player, 'club_id',  None) else None)
    # هیئت: اول از اسنپ‌شات باشگاه، بعد از خود پروفایل بازیکن
    board = enrollment.board \
            or (club.tkd_board if club and getattr(club, 'tkd_board_id', None) else None) \
            or (player.tkd_board if getattr(player, 'tkd_board_id', None) else None)

    award = RankingAward.objects.create(
        enrollment=enrollment,
        player=player, coach=coach, club=club, board=board,
        player_name=f"{getattr(player,'first_name','')} {getattr(player,'last_name','')}".strip(),
        coach_name=(f"{getattr(coach,'first_name','')} {getattr(coach,'last_name','')}".strip() if coach else ""),
        club_name=getattr(club, 'club_name', '') or '',
        board_name=getattr(board, 'name', '') or '',
        points_player=1.0,
        points_coach=0.75 if coach else 0.0,
        points_club=0.5  if club  else 0.0,
        points_board=0.5 if board else 0.0,
    )

    # اعمال امتیازها (اتمیک با F)
    UserProfile.objects.filter(pk=player.pk).update(
        ranking_competition=F('ranking_competition') + award.points_player
    )
    if coach:
        UserProfile.objects.filter(pk=coach.pk).update(
            ranking_total=F('ranking_total') + award.points_coach
        )
    if club:
        TkdClub.objects.filter(pk=club.pk).update(
            ranking_total=F('ranking_total') + award.points_club
        )
    if board:
        TkdBoard.objects.filter(pk=board.pk).update(
            ranking_total=F('ranking_total') + award.points_board
        )

class KyorugiResult(models.Model):
    competition     = models.ForeignKey("KyorugiCompetition", on_delete=models.CASCADE, related_name="results")
    weight_category = models.ForeignKey("WeightCategory",       on_delete=models.CASCADE, related_name="results")

    gold_enrollment    = models.ForeignKey("Enrollment", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    silver_enrollment  = models.ForeignKey("Enrollment", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    bronze1_enrollment = models.ForeignKey("Enrollment", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    bronze2_enrollment = models.ForeignKey("Enrollment", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    notes = models.TextField(blank=True, default="")

    created_by = models.ForeignKey("auth.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("competition", "weight_category")
        verbose_name = "نتیجه وزن"
        verbose_name_plural = "نتایج اوزان"

    def __str__(self):
        return f"{self.competition.title} – {self.weight_category}"

# competitions/models.py (افزودنی)
class RankingTransaction(models.Model):
    SUBJECT_PLAYER = "player"
    SUBJECT_COACH  = "coach"
    SUBJECT_CLUB   = "club"
    SUBJECT_BOARD  = "board"
    SUBJECT_CHOICES = [
        (SUBJECT_PLAYER, "بازیکن"),
        (SUBJECT_COACH,  "مربی"),
        (SUBJECT_CLUB,   "باشگاه"),
        (SUBJECT_BOARD,  "هیئت"),
    ]

    competition  = models.ForeignKey("KyorugiCompetition", on_delete=models.CASCADE, related_name="ranking_transactions")
    result       = models.ForeignKey("KyorugiResult",      on_delete=models.CASCADE, related_name="transactions")
    subject_type = models.CharField(max_length=16, choices=SUBJECT_CHOICES)
    subject_id   = models.IntegerField()
    medal        = models.CharField(max_length=10, blank=True, default="")  # gold/silver/bronze
    points       = models.FloatField(default=0.0)
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["competition", "subject_type", "subject_id"]),
            models.Index(fields=["result"]),
        ]


#-------------------------------------------------------------سمینار----------------------------------------------------------------------------

# -----------------------
# Helpers: public_id
# -----------------------
def _gen_seminar_public_id(n: int = 10) -> str:
    alphabet = string.ascii_lowercase + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(n))

def _unique_public_id_for_model(model_cls, field_name: str = "public_id", length: int = 10, attempts: int = 6) -> str:
    for _ in range(attempts):
        pid = _gen_seminar_public_id(length)
        if not model_cls.objects.filter(**{field_name: pid}).exists():
            return pid
    return _gen_seminar_public_id(length)

def _seminar_default_public_id() -> str:
    return _gen_seminar_public_id(10)


# -----------------------
# Seminar
# -----------------------
class Seminar(models.Model):
    ROLE_PLAYER  = "player"
    ROLE_COACH   = "coach"
    ROLE_REFEREE = "referee"

    ROLE_CHOICES = [
        (ROLE_PLAYER,  "بازیکن"),
        (ROLE_COACH,   "مربی"),
        (ROLE_REFEREE, "داور"),
    ]
    ROLE_VALUES = [r[0] for r in ROLE_CHOICES]

    title       = models.CharField("عنوان", max_length=255)
    poster      = models.ImageField("پوستر", upload_to="seminars/posters/", blank=True, null=True)
    description = models.TextField("توضیحات", blank=True)

    registration_start = models.DateField("شروع ثبت‌نام")
    registration_end   = models.DateField("پایان ثبت‌نام")
    event_date         = models.DateField("تاریخ برگزاری")

    fee      = models.PositiveIntegerField("هزینه (تومان)", default=0)
    location = models.CharField("مکان برگزاری", max_length=255, blank=True)

    allowed_roles = models.JSONField("نقش‌های مجاز", default=list, blank=True,
                                     help_text="مثلاً ['player','coach'] — خالی = همه نقش‌ها")

    created_at = models.DateTimeField("ایجاد شده در", auto_now_add=True)

    public_id = models.CharField(
        "شناسه عمومی",
        max_length=16,
        unique=True,
        db_index=True,
        editable=False,
        default=_seminar_default_public_id,
    )

    class Meta:
        verbose_name = "سمینار"
        verbose_name_plural = "سمینارها"
        indexes = [
            Index(fields=["public_id"]),
            Index(fields=["event_date"]),
        ]
        ordering = ["-event_date", "-created_at"]
        constraints = [
            CheckConstraint(check=Q(registration_start__lte=F("registration_end")),
                            name="seminar_reg_start_lte_reg_end"),
            CheckConstraint(check=Q(registration_end__lte=F("event_date")),
                            name="seminar_reg_end_lte_event_date"),
        ]

    def __str__(self) -> str:
        return self.title or f"سمینار #{self.pk}"

    # -------- Validation --------
    def clean(self):
        if self.registration_start and self.registration_end and self.registration_start > self.registration_end:
            raise ValidationError({"registration_start": "تاریخ شروع ثبت‌نام نباید بعد از تاریخ پایان ثبت‌نام باشد."})
        if self.registration_end and self.event_date and self.registration_end > self.event_date:
            raise ValidationError({"registration_end": "پایان ثبت‌نام نباید بعد از تاریخ برگزاری رویداد باشد."})

        if self.allowed_roles is None:
            self.allowed_roles = []
        elif not isinstance(self.allowed_roles, list):
            raise ValidationError({"allowed_roles": "allowed_roles باید یک لیست از مقادیر باشد."})
        else:
            invalid = [r for r in self.allowed_roles if r not in self.ROLE_VALUES]
            if invalid:
                raise ValidationError({"allowed_roles": f"مقادیر نامعتبر: {invalid}. مقادیر مجاز: {self.ROLE_VALUES}"})

        super().clean()

    # -------- Save with unique public_id --------
    def save(self, *args, **kwargs):
        if not self.public_id:
            self.public_id = _unique_public_id_for_model(type(self))
        for i in range(3):
            try:
                return super().save(*args, **kwargs)
            except IntegrityError as e:
                if "public_id" in str(e).lower() and i < 2:
                    self.public_id = _unique_public_id_for_model(type(self))
                    continue
                raise

    # -------- Helpers --------
    def can_register_role(self, role: Optional[str]) -> bool:
        allowed: List[str] = self.allowed_roles or []
        return True if not allowed else (bool(role) and role in allowed)

    @property
    def registration_open(self) -> bool:
        today = timezone.localdate()
        return self.registration_start <= today <= self.registration_end

    @staticmethod
    def _date_to_jalali_str(d) -> str:
        if not d:
            return ""
        try:
            j = jdatetime.date.fromgregorian(date=d)
            return f"{j.year:04d}/{j.month:02d}/{j.day:02d}"
        except Exception:
            return ""

    @property
    def registration_start_jalali(self) -> str: return self._date_to_jalali_str(self.registration_start)
    @property
    def registration_end_jalali(self)   -> str: return self._date_to_jalali_str(self.registration_end)
    @property
    def event_date_jalali(self)         -> str: return self._date_to_jalali_str(self.event_date)

    def allowed_roles_display(self) -> str:
        vals = self.allowed_roles or []
        if not vals:
            return "همه نقش‌ها"
        mapping = dict(self.ROLE_CHOICES)
        return "، ".join(mapping.get(v, v) for v in vals)


# -----------------------
# SeminarRegistration
# -----------------------
class SeminarRegistration(models.Model):
    seminar = models.ForeignKey(Seminar, verbose_name="سمینار", on_delete=models.CASCADE, related_name="registrations")
    user    = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="کاربر", on_delete=models.CASCADE, related_name="seminar_registrations")

    roles = models.JSONField("نقش/نقش‌ها", default=list, blank=True, help_text="مثال: ['coach']")

    phone = models.CharField("تلفن تماس", max_length=40, blank=True)
    note  = models.TextField("یادداشت", blank=True)

    is_paid     = models.BooleanField("پرداخت شده", default=False)
    paid_amount = models.PositiveIntegerField("مبلغ پرداختی (تومان)", default=0)
    paid_at     = models.DateTimeField("زمان پرداخت", null=True, blank=True)

    created_at = models.DateTimeField("ایجاد شده در", auto_now_add=True)

    class Meta:
        verbose_name = "ثبت‌نام سمینار"
        verbose_name_plural = "ثبت‌نام‌های سمینار"
        unique_together = ("seminar", "user")

    def __str__(self) -> str:
        return f"{self.user} → {self.seminar}"

    def clean(self):
        if self.roles is None:
            self.roles = []
        if not isinstance(self.roles, list):
            raise ValidationError({"roles": "roles باید یک لیست از نقش‌ها باشد."})

        invalid = [r for r in self.roles if r not in self.seminar.ROLE_VALUES]
        if invalid:
            raise ValidationError({"roles": f"نقش‌های نامعتبر: {invalid}"})
        if not self.roles:
            raise ValidationError({"roles": "باید حداقل یک نقش انتخاب شود."})
        super().clean()

    def mark_paid(self, amount: int = 0, ref_code: str = ""):
        if not self.is_paid:
            self.is_paid = True
            self.paid_amount = int(amount or 0)
            self.paid_at = timezone.now()
            self.save(update_fields=["is_paid", "paid_amount", "paid_at"])

# --- Proxy فقط برای ادمین: لیست شرکت‌کنندگان سمینارها ---
class SeminarParticipants(SeminarRegistration):
    class Meta:
        proxy = True
        verbose_name = "لیست شرکت‌کنندگان سمینارها"
        verbose_name_plural = "لیست شرکت‌کنندگان سمینارها"
