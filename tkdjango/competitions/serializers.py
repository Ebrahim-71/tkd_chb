# -*- coding: utf-8 -*-
from rest_framework import serializers
from django.utils import timezone
from datetime import date as _date, datetime as _datetime, timedelta
import jdatetime
from django.core.files.storage import default_storage
import re
from math import inf
from accounts.models import UserProfile
from .models import (
    KyorugiCompetition, CompetitionImage, MatAssignment, Belt,Draw, Match,  BeltGroup,
    CompetitionFile,CoachApproval, WeightCategory, Enrollment,Seminar, SeminarRegistration)


# -------------------------------------------------
# Helpers: digits, dates, belts, club snapshot
# -------------------------------------------------
_DIGIT_MAP = {ord(p): str(i) for i, p in enumerate("۰۱۲۳۴۵۶۷۸۹")}
_DIGIT_MAP.update({ord(a): str(i) for i, a in enumerate("٠١٢٣٤٥٦٧٨٩")})

def _to_en_digits(s):
    return str(s).translate(_DIGIT_MAP) if s is not None else s

def _g2j(d):
    return jdatetime.date.fromgregorian(date=d) if d else None

def _j2str(jd):
    return f"{jd.year:04d}/{jd.month:02d}/{jd.day:02d}" if jd else None

def _to_jalali_date_str(d):
    return _j2str(_g2j(d))

def _parse_jalali_str(s):
    if not s:
        return None
    if isinstance(s, (_date, _datetime)):
        g = s.date() if isinstance(s, _datetime) else s
        return jdatetime.date.fromgregorian(date=g)
    t = _to_en_digits(str(s)).strip().replace("-", "/")
    parts = t.split("/")[:3]
    try:
        y, m, d = [int(x) for x in parts]
    except Exception:
        return None
    try:
        if y >= 1700:
            g = _date(y, m, d)
            return jdatetime.date.fromgregorian(date=g)
        return jdatetime.date(y, m, d)
    except Exception:
        return None
def _find_belt_group_obj(comp, player_belt_code: str):
    """گروه کمربندی‌ای که یکی از کمربندهایش با کُد بازیکن مَچ می‌شود را برمی‌گرداند."""
    if not comp or not player_belt_code:
        return None
    for g in comp.belt_groups.all().prefetch_related("belts"):
        for b in g.belts.all():
            nm = getattr(b, "name", "") or getattr(b, "label", "")
            if _norm_belt(nm) == player_belt_code:
                return g
    return None

def _to_greg_from_str_jalali(s: str):
    """ورودی 'YYYY/MM/DD' شمسی → date میلادی؛ در غیر اینصورت None."""
    if not s:
        return None
    t = _to_en_digits(str(s)).strip().replace("-", "/")
    try:
        jy, jm, jd = [int(x) for x in t.split("/")]
        return jdatetime.date(jy, jm, jd).togregorian()
    except Exception:
        return None

BELT_BASE = {
    "white": "white", "سفید": "white",
    "yellow": "yellow", "زرد": "yellow",
    "green": "green", "سبز": "green",
    "blue": "blue", "آبی": "blue", "ابي": "blue", "ابی": "blue",
    "red": "red", "قرمز": "red",
    "black": "black", "مشکی": "black", "مشكى": "black",
}
_DAN_RE = re.compile(r"(مشکی|مشكى)\s*دان\s*(\d{1,2})", re.IGNORECASE)

def _norm_belt(s):
    if not s:
        return None
    t = _to_en_digits(str(s)).strip().lower().replace("ي", "ی").replace("ك", "ک")
    m = _DAN_RE.search(t)
    if m:
        try:
            dan = int(_to_en_digits(m.group(2)))
            if 1 <= dan <= 10:
                return "black"
        except Exception:
            pass
    for k, v in BELT_BASE.items():
        if k in t:
            return v
    if t in {"white", "yellow", "green", "blue", "red", "black"}:
        return t
    return None

def _allowed_belts(obj: KyorugiCompetition):
    """فقط از belt_groups یا belt_level قدیمی می‌خوانیم (بدون Division)."""
    allowed = set()
    if obj.belt_groups.exists():
        for g in obj.belt_groups.all().prefetch_related("belts"):
            for b in g.belts.all():
                code = _norm_belt(getattr(b, "name", "") or getattr(b, "label", ""))
                if code:
                    allowed.add(code)
    else:
        if obj.belt_level == "yellow_blue":
            allowed.update({"yellow", "green", "blue"})
        elif obj.belt_level == "red_black":
            allowed.update({"red", "black"})
        else:
            allowed.update({"white", "yellow", "green", "blue", "red", "black"})
    return sorted(list(allowed))

def _terms_title(obj):
    return obj.terms_template.title if getattr(obj, "terms_template", None) else None

def _terms_content(obj):
    return obj.terms_template.content if getattr(obj, "terms_template", None) else None

def _collect_comp_weights(comp):
    """WeightCategoryهایی که برای مسابقه روی زمین‌ها ست‌شده‌اند."""
    ws = set()
    for ma in comp.mat_assignments.all().prefetch_related("weights"):
        for w in ma.weights.all():
            ws.add(w)
    return list(ws)

def _wc_includes(wc, val: float) -> bool:
    tol = getattr(wc, "tolerance", 0) or 0
    mn  = getattr(wc, "min_weight", None)
    mx  = getattr(wc, "max_weight", None)
    lo  = -inf if mn is None else (mn - tol)
    hi  =  inf if mx is None else (mx + tol)
    return (val >= lo) and (val <= hi)

def _gender_ok_for_wc(comp, wc_gender):
    if not getattr(comp, "gender", None):
        return True
    if not wc_gender:
        return True
    return str(wc_gender) == str(comp.gender)

def _find_belt_group_label(comp, player_belt_code: str) -> str | None:
    for g in comp.belt_groups.all().prefetch_related("belts"):
        codes = set()
        for b in g.belts.all():
            nm = getattr(b, "name", "") or getattr(b, "label", "")
            code = _norm_belt(nm)
            if code:
                codes.add(code)
        if player_belt_code in codes:
            return getattr(g, "label", None) or getattr(g, "name", None)
    return None

def _extract_club_profile_and_name(player: UserProfile):
    """
    خروجی: (club_profile_for_fk, club_name_snapshot)
    اگر club در پروفایل از جنس UserProfile بود، همان را برمی‌گردانیم؛
    اگر از جنس TkdClub یا هر نوع دیگری بود، FK = None و فقط club_name را پر می‌کنیم.
    """
    club_profile = None
    club_name = ""

    raw = getattr(player, "club", None)

    # حالت 1: باشگاه از جنس UserProfile (همان چیزی که Enrollment.club می‌خواهد)
    if isinstance(raw, UserProfile) and getattr(raw, "is_club", False):
        club_profile = raw
        club_name = getattr(raw, "club_name", "") or getattr(raw, "full_name", "") or ""

    # حالت 2: هر نوع آبجکت دیگری که name/club_name دارد (مثل TkdClub)
    elif raw is not None:
        club_name = getattr(raw, "club_name", "") or getattr(raw, "name", "") or ""

    # حالت 3: لیست اسامی در پروفایل
    if not club_name and isinstance(getattr(player, "club_names", None), list):
        club_name = "، ".join([c for c in player.club_names if c])

    return club_profile, club_name

def _parse_weight_to_float(raw):
    """
    وزن ورودی → float
    - تبدیل ارقام فارسی/عربی
    - جایگزینی جداکننده‌ها (/ , ، ٫) با '.'
    - حذف کاراکترهای غیرعددی
    - جلوگیری از چند نقطه
    """
    t = _to_en_digits(raw or "")
    for ch in "/٫,،":
        t = t.replace(ch, ".")
    # فقط رقم و نقطه
    t = "".join(ch for ch in t if (ch.isdigit() or ch == "."))
    # حذف نقطه‌های اضافه
    if t.count(".") > 1:
        first = t.find(".")
        t = t[:first + 1] + t[first + 1:].replace(".", "")
    return float(t)

# -------------------------------------------------
# Nested serializers
# -------------------------------------------------
class WeightCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = WeightCategory
        fields = ("id", "name", "gender", "min_weight", "max_weight", "tolerance")

class MatAssignmentSerializer(serializers.ModelSerializer):
    weights = WeightCategorySerializer(many=True, read_only=True)
    class Meta:
        model = MatAssignment
        fields = ("id", "mat_number", "weights")

class CompetitionImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = CompetitionImage
        fields = ("id", "image")

class CompetitionFileSerializer(serializers.ModelSerializer):
    class Meta:
        model = CompetitionFile
        fields = ("id", "file")

# -------------------------------------------------
# Competition detail
# -------------------------------------------------
class KyorugiCompetitionDetailSerializer(serializers.ModelSerializer):
    age_category_name  = serializers.CharField(source="age_category.name", read_only=True)
    gender_display     = serializers.CharField(source="get_gender_display", read_only=True)
    belt_level_display = serializers.CharField(source="get_belt_level_display", read_only=True)
    style_display      = serializers.CharField(read_only=True)

    terms_title   = serializers.SerializerMethodField()
    terms_content = serializers.SerializerMethodField()

    registration_start_jalali = serializers.SerializerMethodField()
    registration_end_jalali   = serializers.SerializerMethodField()
    weigh_date_jalali         = serializers.SerializerMethodField()
    draw_date_jalali          = serializers.SerializerMethodField()
    competition_date_jalali   = serializers.SerializerMethodField()

    belt_groups_display = serializers.SerializerMethodField()
    can_register        = serializers.SerializerMethodField()
    user_eligible_self  = serializers.SerializerMethodField()

    allowed_belts       = serializers.SerializerMethodField()
    age_from            = serializers.SerializerMethodField()
    age_to              = serializers.SerializerMethodField()
    eligibility_debug   = serializers.SerializerMethodField()
    bracket_ready = serializers.SerializerMethodField()
    bracket_stats = serializers.SerializerMethodField()
    images          = CompetitionImageSerializer(many=True, read_only=True)
    files           = CompetitionFileSerializer(many=True, read_only=True)
    mat_assignments = MatAssignmentSerializer(many=True, read_only=True)

    class Meta:
        model = KyorugiCompetition
        fields = [
            "id", "public_id",
            "title", "poster", "entry_fee",
            "age_category_name", "gender_display", "belt_level_display",
            "style_display",
            "city", "address",
            "registration_open",
            "registration_start", "registration_end",
            "weigh_date", "draw_date", "competition_date",
            "registration_start_jalali", "registration_end_jalali",
            "weigh_date_jalali", "draw_date_jalali", "competition_date_jalali",
            "belt_groups_display",
            "mat_count",
            "mat_assignments",
            "images", "files",
            "can_register",
            "user_eligible_self",
            "allowed_belts",
            "age_from", "age_to",
            "eligibility_debug",
            "terms_title", "terms_content","bracket_ready", "bracket_stats",
        ]

    def get_terms_title(self, obj):   return _terms_title(obj)
    def get_terms_content(self, obj): return _terms_content(obj)
    def get_registration_start_jalali(self, obj): return _to_jalali_date_str(obj.registration_start)
    def get_registration_end_jalali(self, obj):   return _to_jalali_date_str(obj.registration_end)
    def get_weigh_date_jalali(self, obj):         return _to_jalali_date_str(obj.weigh_date)
    def get_draw_date_jalali(self, obj):          return _to_jalali_date_str(obj.draw_date)
    def get_competition_date_jalali(self, obj):   return _to_jalali_date_str(obj.competition_date)

    def get_bracket_ready(self, obj):
        # حداقل یک قرعه وجود داشته باشد و هیچ بازی واقعیِ بدون شماره نباشد
        if not obj.draws.exists():
            return False
        return not Match.objects.filter(
            draw__competition=obj,
            is_bye=False,
            match_number__isnull=True
        ).exists()

    def get_bracket_stats(self, obj):
        # صرفاً جهت دیباگ/نمایش دلخواه؛ اجباری نیست
        total = Match.objects.filter(draw__competition=obj).count()
        real_total = Match.objects.filter(draw__competition=obj, is_bye=False).count()
        real_numbered = Match.objects.filter(
            draw__competition=obj, is_bye=False, match_number__isnull=False
        ).count()
        return {
            "draws": obj.draws.count(),
            "matches_total": total,
            "real_total": real_total,
            "real_numbered": real_numbered,
        }
    def get_belt_groups_display(self, obj):
        names = list(obj.belt_groups.values_list("label", flat=True))
        return "، ".join([n for n in names if n]) if names else ""

    def get_can_register(self, obj):
        if not obj.registration_open:
            return False
        today = timezone.localdate()
        if obj.registration_start and obj.registration_end:
            return obj.registration_start <= today <= obj.registration_end
        return True

    def _get_profile(self, user):
        return (
            UserProfile.objects.filter(user=user, role__in=["player", "both"]).first()
            or UserProfile.objects.filter(user=user).first()
        )

    def _get_player_belt(self, prof):
        pri = (
            getattr(prof, "belt_grade", None)
            or getattr(prof, "belt_name", None)
            or getattr(prof, "belt_level", None)
            or getattr(prof, "belt_code", None)
        )
        return _norm_belt(pri)

    def get_user_eligible_self(self, obj):
        req = self.context.get("request")
        user = getattr(req, "user", None)
        if not user or not user.is_authenticated:
            return False
        prof = self._get_profile(user)
        if not prof:
            return False

        gender_ok = True
        if getattr(obj, "gender", None) and getattr(prof, "gender", None):
            gender_ok = (obj.gender == prof.gender)

        dob_j = _parse_jalali_str(getattr(prof, "birth_date", None))
        from_j = _g2j(getattr(obj.age_category, "from_date", None)) if obj.age_category else None
        to_j   = _g2j(getattr(obj.age_category, "to_date", None))   if obj.age_category else None
        age_ok = True
        if from_j and to_j:
            age_ok = bool(dob_j and (from_j <= dob_j <= to_j))

        allowed = set(_allowed_belts(obj))
        player_belt = self._get_player_belt(prof)
        belt_ok = True if not allowed else bool(player_belt and player_belt in allowed)

        return bool(gender_ok and age_ok and belt_ok)

    def get_allowed_belts(self, obj): return _allowed_belts(obj)
    def get_age_from(self, obj): return _j2str(_g2j(getattr(obj.age_category, "from_date", None))) if obj.age_category else None
    def get_age_to(self, obj):   return _j2str(_g2j(getattr(obj.age_category, "to_date", None))) if obj.age_category else None

    def get_eligibility_debug(self, obj):
        req = self.context.get("request")
        user = getattr(req, "user", None)
        today = timezone.localdate()
        in_reg_window = True
        if obj.registration_start and obj.registration_end:
            in_reg_window = obj.registration_start <= today <= obj.registration_end

        data = {
            "registration_open": bool(obj.registration_open),
            "in_reg_window": bool(in_reg_window),
            "required_gender": getattr(obj, "gender", None),
            "player_gender": None,
            "gender_ok": None,
            "age_from": self.get_age_from(obj),
            "age_to": self.get_age_to(obj),
            "player_dob": None,
            "age_ok": None,
            "allowed_belts": _allowed_belts(obj),
            "player_belt": None,
            "belt_ok": None,
            "profile_role": None,
        }

        if not user or not user.is_authenticated:
            return data

        prof = self._get_profile(user)
        if not prof:
            return data

        data["profile_role"] = getattr(prof, "role", None)
        data["player_gender"] = getattr(prof, "gender", None)
        if data["required_gender"] and data["player_gender"]:
            data["gender_ok"] = (data["required_gender"] == data["player_gender"])

        dob_j = _parse_jalali_str(getattr(prof, "birth_date", None))
        data["player_dob"] = _j2str(dob_j) if dob_j else None
        from_j = _g2j(getattr(obj.age_category, "from_date", None)) if obj.age_category else None
        to_j   = _g2j(getattr(obj.age_category, "to_date", None))   if obj.age_category else None
        data["age_ok"] = bool(dob_j and from_j and to_j and (from_j <= dob_j <= to_j))

        data["player_belt"] = self._get_player_belt(prof)
        allowed = set(data["allowed_belts"])
        data["belt_ok"] = True if not allowed else bool(data["player_belt"] and data["player_belt"] in allowed)

        return data

# -------------------------------------------------
# Register-self (بدون Division)
# -------------------------------------------------

class CompetitionRegistrationSerializer(serializers.Serializer):
    coach_code = serializers.CharField(allow_blank=True, required=False)
    declared_weight = serializers.CharField()
    insurance_number = serializers.CharField()
    insurance_issue_date = serializers.CharField()  # YYYY/MM/DD شمسی

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._competition = self.context.get("competition")
        self._request = self.context.get("request")
        self._player = None
        self._coach = None
        self._coach_code = ""
        self._belt_group = None
        self._weight_category = None
        self._issue_date_greg = None
        self._declared_weight_float = None

    # کمکی: استخراج کُد کمربند بازیکن به صورت استاندارد (white/yellow/…/black)
    def _player_belt_code(self, prof: UserProfile):
        b_attr = getattr(prof, "belt", None)
        # اگر FK یا id باشد
        if isinstance(b_attr, Belt):
            return _norm_belt(getattr(b_attr, "name", None))
        if isinstance(b_attr, int):
            b = Belt.objects.filter(id=b_attr).first()
            if b:
                return _norm_belt(getattr(b, "name", None))
        # fallback به فیلدهای متنی رایج
        raw = (
            getattr(prof, "belt_grade", None)
            or getattr(prof, "belt_name", None)
            or getattr(prof, "belt_level", None)
            or getattr(prof, "belt_code", None)
        )
        return _norm_belt(raw)

    from typing import Optional  # در صورت Python 3.9

    def validate(self, attrs):
        comp = self._competition
        req = self._request
        if not comp:
            raise serializers.ValidationError({"__all__": "مسابقه یافت نشد."})

        # بازه‌ی ثبت‌نام
        today = timezone.localdate()
        if comp.registration_start and today < comp.registration_start:
            raise serializers.ValidationError({"__all__": "ثبت‌نام هنوز شروع نشده است."})
        if comp.registration_end and today > comp.registration_end:
            raise serializers.ValidationError({"__all__": "مهلت ثبت‌نام به پایان رسیده است."})
        if not comp.registration_open:
            raise serializers.ValidationError({"__all__": "ثبت‌نام این مسابقه فعال نیست."})

        # پروفایل بازیکن
        player = UserProfile.objects.filter(user=req.user, role__in=["player", "both"]).first()
        if not player:
            raise serializers.ValidationError({"__all__": "پروفایل بازیکن پیدا نشد."})
        self._player = player

        # جلوگیری از ثبت‌نام تکراری (سخت‌گیرانه)
        if Enrollment.objects.filter(competition=comp, player=player).exists():
            raise serializers.ValidationError({"__all__": "برای این مسابقه قبلاً ثبت‌نام کرده‌اید."})

        # تاریخ بیمه (≥ ۷۲ ساعت قبل)
        issue_g = _to_greg_from_str_jalali(attrs.get("insurance_issue_date"))
        if not issue_g:
            raise serializers.ValidationError({"insurance_issue_date": "تاریخ صدور نامعتبر است (مثلاً ۱۴۰۳/۰۵/۲۰)."})
        if comp.competition_date and issue_g > (comp.competition_date - timedelta(days=3)):
            raise serializers.ValidationError(
                {"insurance_issue_date": "تاریخ صدور باید حداقل ۷۲ ساعت قبل از برگزاری باشد."})
        self._issue_date_greg = issue_g

        # وزن
        try:
            w = _parse_weight_to_float(attrs.get("declared_weight") or "")
        except Exception:
            raise serializers.ValidationError({"declared_weight": "وزن نامعتبر است."})
        self._declared_weight_float = w

        # نیاز به کد مربی؟
        coach_code = (attrs.get("coach_code") or "").strip()
        need_coach = bool(getattr(comp, "coach_approval_required", False))
        if need_coach:
            if not coach_code:
                raise serializers.ValidationError({"coach_code": "کد تأیید مربی الزامی است."})
            appr = CoachApproval.objects.filter(
                competition=comp, code=coach_code, is_active=True, terms_accepted=True
            ).select_related("coach").first()
            if not appr:
                raise serializers.ValidationError({"coach_code": "کد مربی معتبر نیست."})
            self._coach = appr.coach
            self._coach_code = appr.code
        else:
            self._coach = getattr(player, "coach", None)
            self._coach_code = coach_code or ""

        # گروه کمربندی سازگار با مسابقه (اگر گروه تعریف شده)
        belt_group = None
        b_obj = getattr(player, "belt", None)
        if isinstance(b_obj, Belt):
            for g in comp.belt_groups.all().prefetch_related("belts"):
                if g.belts.filter(id=b_obj.id).exists():
                    belt_group = g
                    break
        elif isinstance(b_obj, int):
            b = Belt.objects.filter(id=b_obj).first()
            if b:
                for g in comp.belt_groups.all().prefetch_related("belts"):
                    if g.belts.filter(id=b.id).exists():
                        belt_group = g
                        break
        if belt_group is None:
            code = self._player_belt_code(player)  # white/yellow/…
            if code:
                belt_group = _find_belt_group_obj(comp, code)

        if comp.belt_groups.exists() and not belt_group:
            raise serializers.ValidationError({"belt_group": "کمربند شما با گروه‌های مسابقه سازگار نیست."})
        self._belt_group = belt_group

        # انتخاب رده‌ی وزنی از وزن‌های تخصیص‌یافته‌ی همین مسابقه
        chosen = None
        for wc in _collect_comp_weights(comp):
            if _gender_ok_for_wc(comp, getattr(wc, "gender", None)) and _wc_includes(wc, w):
                chosen = wc
                break
        if not chosen:
            raise serializers.ValidationError({"declared_weight": "هیچ رده وزنی متناسب با این وزن در مسابقه یافت نشد."})
        self._weight_category = chosen

        # شماره بیمه
        if not (attrs.get("insurance_number") or "").strip():
            raise serializers.ValidationError({"insurance_number": "شماره بیمه الزامی است."})

        return attrs

    def create(self, validated_data):
        comp   = self._competition
        player = self._player
        coach  = self._coach

        coach_name = f"{getattr(coach, 'first_name', '')} {getattr(coach, 'last_name', '')}".strip() if coach else ""

        club_obj   = getattr(player, "club", None)          # TkdClub
        club_name  = getattr(club_obj, "club_name", "") or ""
        board_obj  = getattr(player, "tkd_board", None)     # TkdBoard
        board_name = getattr(board_obj, "name", "") or ""
        if not club_name and isinstance(getattr(player, "club_names", None), list):
            club_name = "، ".join([c for c in player.club_names if c])

        e = Enrollment.objects.create(
            competition=comp,
            player=player,
            coach=coach,
            coach_name=coach_name,
            coach_approval_code=self._coach_code,

            club=club_obj, club_name=club_name,
            board=board_obj, board_name=board_name,

            belt_group=self._belt_group,           # حالا عملاً خالی نمی‌ماند مگر مسابقه گروه نداشته باشد
            weight_category=self._weight_category,

            declared_weight=self._declared_weight_float,
            insurance_number=validated_data.get("insurance_number"),
            insurance_issue_date=self._issue_date_greg,
            status="pending_payment",
        )
        return e

    def to_representation(self, instance: Enrollment):
        return {
            "enrollment_id": instance.id,
            "status": instance.status,
            "paid": instance.is_paid,
            "paid_amount": instance.paid_amount,
            "bank_ref_code": instance.bank_ref_code,
        }

# -------------------------------------------------
# Dashboard list item
# -------------------------------------------------
class DashboardKyorugiCompetitionSerializer(serializers.ModelSerializer):
    age_category_name  = serializers.CharField(source="age_category.name", read_only=True)
    gender_display     = serializers.CharField(source="get_gender_display", read_only=True)
    belt_level_display = serializers.CharField(source="get_belt_level_display", read_only=True)
    style_display      = serializers.CharField(read_only=True)

    registration_start_jalali = serializers.SerializerMethodField()
    registration_end_jalali   = serializers.SerializerMethodField()
    weigh_date_jalali         = serializers.SerializerMethodField()
    draw_date_jalali          = serializers.SerializerMethodField()
    competition_date_jalali   = serializers.SerializerMethodField()

    can_register = serializers.SerializerMethodField()
    status       = serializers.SerializerMethodField()

    class Meta:
        model = KyorugiCompetition
        fields = [
            "id", "public_id",
            "title", "poster", "entry_fee",
            "age_category_name", "gender_display", "belt_level_display",
            "style_display",
            "city",
            "registration_open",
            "registration_start", "registration_end",
            "weigh_date", "draw_date", "competition_date",
            "registration_start_jalali", "registration_end_jalali",
            "weigh_date_jalali", "draw_date_jalali", "competition_date_jalali",
            "can_register", "status",
        ]

    def get_registration_start_jalali(self, obj): return _to_jalali_date_str(obj.registration_start)
    def get_registration_end_jalali(self, obj):   return _to_jalali_date_str(obj.registration_end)
    def get_weigh_date_jalali(self, obj):         return _to_jalali_date_str(obj.weigh_date)
    def get_draw_date_jalali(self, obj):          return _to_jalali_date_str(obj.draw_date)
    def get_competition_date_jalali(self, obj):   return _to_jalali_date_str(obj.competition_date)

    def get_can_register(self, obj):
        if not obj.registration_open:
            return False
        today = timezone.localdate()
        if obj.registration_start and obj.registration_end:
            return obj.registration_start <= today <= obj.registration_end
        return True

    def get_status(self, obj):
        if not obj.competition_date:
            return "unknown"
        today = timezone.localdate()
        if today < obj.competition_date:
            return "upcoming"
        elif today == obj.competition_date:
            return "today"
        return "finished"

# -------------------------------------------------
# Enrollment card
# -------------------------------------------------
BELT_FA = {"white":"سفید","yellow":"زرد","green":"سبز","blue":"آبی","red":"قرمز","black":"مشکی"}

def _abs_media(request, f):
    try:
        if not f:
            return None
        url = getattr(f, "url", None) or str(f)
        if not url:
            return None
        return request.build_absolute_uri(url) if request else url
    except Exception:
        return None

class EnrollmentCardSerializer(serializers.ModelSerializer):
    competition_title = serializers.CharField(source="competition.title", read_only=True)
    competition_date_jalali = serializers.SerializerMethodField()

    first_name = serializers.CharField(source="player.first_name", read_only=True)
    last_name  = serializers.CharField(source="player.last_name", read_only=True)
    birth_date = serializers.SerializerMethodField()
    photo      = serializers.SerializerMethodField()

    declared_weight = serializers.FloatField(read_only=True)

    weight_name  = serializers.SerializerMethodField()
    # weight_range = serializers.SerializerMethodField()  # ❌ حذف شد از خروجی

    belt       = serializers.SerializerMethodField()
    belt_group = serializers.SerializerMethodField()

    insurance_number = serializers.CharField(read_only=True)
    insurance_issue_date_jalali = serializers.SerializerMethodField()

    # ⚠️ card_id عمداً تعریف نشده تا در خروجی نیاید

    class Meta:
        model = Enrollment
        fields = [
            "competition_title", "competition_date_jalali",
            "first_name", "last_name", "birth_date", "photo",
            "declared_weight",
            "weight_name",
            "belt", "belt_group",
            "insurance_number", "insurance_issue_date_jalali",
            "coach_name", "club_name",
        ]

    def get_competition_date_jalali(self, obj):
        return _to_jalali_date_str(obj.competition.competition_date)

    def get_birth_date(self, obj):
        bd = getattr(obj.player, "birth_date", None)
        if not bd:
            return None
        if isinstance(bd, (_datetime, _date)):
            return _to_jalali_date_str(bd)
        return str(bd)

    def get_photo(self, obj):
        """
        عکس بازیکن را از UserProfile می‌خواند.
        اولویت: profile_image → سپس avatar/photo/image (اگر وجود داشت).
        هم FileField و هم رشته‌ی نسبی/URL را پوشش می‌دهد.
        """
        request = self.context.get("request")
        prof = obj.player

        # 1) فیلد اصلی طبق مدل شما
        cand = getattr(prof, "profile_image", None)
        # اگر خالی بود یا name نداشت، فallback:
        if not cand or (hasattr(cand, "name") and not getattr(cand, "name", "")):
            for alt in ("avatar", "photo", "image"):
                v = getattr(prof, alt, None)
                if v and (not hasattr(v, "name") or getattr(v, "name", "")):
                    cand = v
                    break

        return _abs_media(request, cand)

    def _pick_wc(self, obj):
        if getattr(obj, "weight_category", None):
            return obj.weight_category
        declared = getattr(obj, "declared_weight", None)
        if not declared:
            return None
        for wc in _collect_comp_weights(obj.competition):
            if _gender_ok_for_wc(obj.competition, getattr(wc, "gender", None)) and _wc_includes(wc, declared):
                return wc
        return None

    def get_weight_name(self, obj):
        wc = self._pick_wc(obj)
        return getattr(wc, "name", None) if wc else None

    # def get_weight_range(self, obj):  # ❌ دیگر استفاده نمی‌کنیم
    #     ...

    def get_belt(self, obj):
        raw = (
            getattr(obj.player, "belt_grade", None)
            or getattr(obj.player, "belt_name", None)
            or getattr(obj.player, "belt_level", None)
            or getattr(obj.player, "belt_code", None)
        )
        code = _norm_belt(raw)
        return BELT_FA.get(code, raw or None)

    def get_belt_group(self, obj):
        if getattr(obj, "belt_group", None):
            return getattr(obj.belt_group, "label", None)
        code = _norm_belt(
            getattr(obj.player, "belt_grade", None)
            or getattr(obj.player, "belt_name", None)
            or getattr(obj.player, "belt_level", None)
            or getattr(obj.player, "belt_code", None)
        )
        return _find_belt_group_label(obj.competition, code)

    def get_insurance_issue_date_jalali(self, obj):
        return _to_jalali_date_str(obj.insurance_issue_date)
# competitions/serializers.py
class MatchSlimSerializer(serializers.ModelSerializer):
    player_a_name = serializers.SerializerMethodField()
    player_b_name = serializers.SerializerMethodField()
    winner_name   = serializers.SerializerMethodField()
    class Meta:
        model = Match
        fields = ("id","round_no","slot_a","slot_b","is_bye","mat_no","match_number",
                  "player_a_name","player_b_name","winner_name")
    def _nm(self, u): return f"{getattr(u,'first_name','')} {getattr(u,'last_name','')}".strip() if u else None
    def get_player_a_name(self, obj): return self._nm(obj.player_a)
    def get_player_b_name(self, obj): return self._nm(obj.player_b)
    def get_winner_name(self, obj):   return self._nm(obj.winner)

class DrawWithMatchesSerializer(serializers.ModelSerializer):
    age_category_name = serializers.CharField(source="age_category.name", read_only=True)
    belt_group_label  = serializers.CharField(source="belt_group.label", read_only=True)
    weight_name       = serializers.CharField(source="weight_category.name", read_only=True)
    gender_display    = serializers.SerializerMethodField()
    matches           = MatchSlimSerializer(many=True, read_only=True)
    class Meta:
        model = Draw
        fields = ("id","gender","gender_display","age_category_name","belt_group_label",
                  "weight_name","size","matches")
    def get_gender_display(self, obj):
        return "آقایان" if obj.gender=="male" else ("بانوان" if obj.gender=="female" else obj.gender)

def _bracket_ready_for(comp):
    # حداقل یک قرعه باشد و هیچ مسابقهٔ واقعی بدون شماره باقی نماند
    if not comp.draws.exists():
        return False
    from .models import Match
    return not Match.objects.filter(
        draw__competition=comp, is_bye=False, match_number__isnull=True
    ).exists()

def _bracket_stats_for(comp):
    from .models import Match
    total = Match.objects.filter(draw__competition=comp).count()
    real_total = Match.objects.filter(draw__competition=comp, is_bye=False).count()
    real_numbered = Match.objects.filter(
        draw__competition=comp, is_bye=False, match_number__isnull=False
    ).count()
    return {
        "draws": comp.draws.count(),
        "matches_total": total,
        "real_total": real_total,
        "real_numbered": real_numbered,
    }

class KyorugiBracketSerializer(serializers.Serializer):
    """
    Serializer پاسخِ /api/competitions/kyorugi/<public_id>/bracket/
    ساختار خروجی:
    {
      "competition": {...},
      "draws": [ {id, gender_display, ... , matches:[...]}, ... ],
      "by_mat": [ {mat_no, count, matches:[...]}, ... ]
    }
    """
    def to_representation(self, comp):
        from .models import Match, Draw  # امن برای import محلی

        # قرعه‌ها + مسابقات
        draws_qs = (
            Draw.objects.filter(competition=comp)
            .select_related("age_category", "belt_group", "weight_category")
            .prefetch_related(
                "matches",
                "matches__player_a", "matches__player_b", "matches__winner"
            )
            .order_by("id")
        )
        draws = DrawWithMatchesSerializer(draws_qs, many=True, context=self.context).data

        # گروه‌بندی بر اساس زمین
        by_mat = []
        mat_count = comp.mat_count or 1
        for m in range(1, mat_count + 1):
            qs = (
                Match.objects.filter(draw__competition=comp, mat_no=m)
                .order_by("match_number", "id")
                .select_related("player_a", "player_b", "winner")
            )
            by_mat.append({
                "mat_no": m,
                "count": qs.count(),
                "matches": MatchSlimSerializer(qs, many=True, context=self.context).data,
            })

        return {
            "competition": {
                "id": comp.id,
                "public_id": comp.public_id,
                "title": comp.title,
                "mat_count": mat_count,
                "bracket_ready": _bracket_ready_for(comp),
                "bracket_stats": _bracket_stats_for(comp),
            },
            "draws": draws,
            "by_mat": by_mat,
        }


#-------------------------------------------------------------سمینار----------------------------------------------------------------------------

def _to_jalali_str(d):
    if not d:
        return None
    if isinstance(d, (timezone.datetime,)):
        d = d.date()
    try:
        jd = jdatetime.date.fromgregorian(date=d)
        return jd.strftime("%Y/%m/%d")
    except Exception:
        return None

def _abs_url(request, url_or_field):
    if not url_or_field:
        return None
    try:
        return request.build_absolute_uri(url_or_field.url if hasattr(url_or_field, "url") else url_or_field)
    except Exception:
        return None

def _normalize_iran_mobile(s: str):
    if not s:
        return s
    digits = "".join(ch for ch in s if ch.isdigit())
    # حذف پیش‌شمارهٔ ایران اگر آمده باشد
    if digits.startswith("0098"):
        digits = digits[4:]
    elif digits.startswith("98"):
        digits = digits[2:]
    elif digits.startswith("+98"):
        digits = digits[3:]
    # حالا باید با 09 شروع شود و 11 رقم باشد
    if len(digits) == 10 and digits.startswith("9"):
        digits = "0" + digits
    return digits

# -----------------------------
# Seminar Serializer
# -----------------------------
class SeminarSerializer(serializers.ModelSerializer):
    registration_start_jalali = serializers.SerializerMethodField(read_only=True)
    registration_end_jalali   = serializers.SerializerMethodField(read_only=True)
    event_date_jalali         = serializers.SerializerMethodField(read_only=True)
    poster_url                = serializers.SerializerMethodField(read_only=True)
    is_open_for_registration  = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Seminar
        fields = [
            'id','public_id','title','poster','poster_url','description',
            'registration_start','registration_start_jalali',
            'registration_end','registration_end_jalali',
            'event_date','event_date_jalali',
            'location','fee','allowed_roles','is_open_for_registration','created_at'
        ]
        read_only_fields = ['id','public_id','created_at',
                            'registration_start_jalali','registration_end_jalali',
                            'event_date_jalali','poster_url','is_open_for_registration']

    def get_registration_start_jalali(self, obj):
        return _to_jalali_str(obj.registration_start)

    def get_registration_end_jalali(self, obj):
        return _to_jalali_str(obj.registration_end)

    def get_event_date_jalali(self, obj):
        return _to_jalali_str(obj.event_date)

    def get_poster_url(self, obj):
        req = self.context.get('request')
        return _abs_url(req, obj.poster) if req else (obj.poster.url if getattr(obj.poster, "url", None) else None)

    def get_is_open_for_registration(self, obj):
        today = timezone.localdate()
        return bool(obj.registration_start <= today <= obj.registration_end)

# -----------------------------
# SeminarRegistration Serializer
# -----------------------------
class SeminarRegistrationSerializer(serializers.ModelSerializer):
    user = serializers.HiddenField(default=serializers.CurrentUserDefault())
    seminar_public_id = serializers.CharField(write_only=True, required=False, allow_blank=True, allow_null=True)

    class Meta:
        model = SeminarRegistration
        fields = [
            'id','seminar','seminar_public_id','user','roles','phone','note',
            'is_paid','paid_amount','paid_at','created_at'
        ]
        read_only_fields = ['id','is_paid','paid_amount','paid_at','created_at']

    def _resolve_seminar(self, attrs):
        """Allow passing either seminar pk or seminar_public_id."""
        seminar = attrs.get('seminar')
        if seminar:
            return seminar
        public_id = self.initial_data.get('seminar_public_id') or attrs.get('seminar_public_id')
        if public_id:
            try:
                return Seminar.objects.get(public_id=public_id)
            except Seminar.DoesNotExist:
                raise serializers.ValidationError({"seminar_public_id": "سمینار با این شناسه یافت نشد."})
        raise serializers.ValidationError({"seminar": "سمینار مشخص نشده است."})

    def validate(self, attrs):
        request = self.context.get('request')
        user = attrs.get('user') or (request.user if request and request.user.is_authenticated else None)
        if not user or not user.is_authenticated:
            raise serializers.ValidationError({"user": "برای ثبت‌نام باید وارد حساب شوید."})

        seminar = self._resolve_seminar(attrs)
        attrs['seminar'] = seminar

        # زمان‌بندی ثبت‌نام
        today = timezone.localdate()
        if not (seminar.registration_start <= today <= seminar.registration_end):
            raise serializers.ValidationError({"seminar": "ثبت‌نام این سمینار فعال نیست یا خارج از بازه است."})

        # نقش‌ها
        roles = attrs.get('roles') or []
        if not isinstance(roles, (list, tuple)):
            raise serializers.ValidationError({"roles": "فرمت roles باید آرایه باشد."})
        roles = list(roles)

        allowed = seminar.allowed_roles or []
        if allowed:
            if not roles:
                raise serializers.ValidationError({"roles": "برای این سمینار انتخاب نقش الزامی است."})
            if not set(roles).issubset(set(allowed)):
                raise serializers.ValidationError({"roles": "یک یا چند نقش انتخاب‌شده مجاز نیستند."})

        attrs['roles'] = roles

        # شماره موبایل
        phone = attrs.get('phone')
        if not phone and hasattr(user, "userprofile"):
            # تلاش برای برداشتن از پروفایل
            phone = getattr(user.userprofile, "phone", None)
        phone_norm = _normalize_iran_mobile(phone) if phone else None
        if not phone_norm:
            raise serializers.ValidationError({"phone": "شماره موبایل الزامی است."})
        if not (len(phone_norm) == 11 and phone_norm.startswith("09")):
            raise serializers.ValidationError({"phone": "شماره موبایل نامعتبر است. نمونه صحیح: 09123456789"})
        attrs['phone'] = phone_norm

        # جلوگیری از ثبت‌نام تکراری
        exists = SeminarRegistration.objects.filter(seminar=seminar, user=user).exists()
        if exists:
            raise serializers.ValidationError({"seminar": "شما قبلاً در این سمینار ثبت‌نام کرده‌اید."})

        return attrs

    def create(self, validated_data):
        reg = super().create(validated_data)
        # اگر هزینه صفر است، پرداخت را خودکار ثبت کن
        try:
            if getattr(reg.seminar, "fee", 0) == 0:
                reg.mark_paid(amount=0)
        except AttributeError:
            # اگر متد mark_paid ندارید، به صورت محافظه‌کارانه نادیده بگیر
            pass
        return reg


class SeminarCardSerializer(serializers.ModelSerializer):
    poster_url = serializers.SerializerMethodField()
    # این سه تا مستقیماً از پراپرتی‌های مدل خونده می‌شن
    event_date_jalali = serializers.ReadOnlyField()
    registration_start_jalali = serializers.ReadOnlyField()
    registration_end_jalali = serializers.ReadOnlyField()
    # وضعیت باز بودن ثبت‌نام
    registration_open = serializers.SerializerMethodField()
    # آیا برای نقش کاربر فعلی قابل‌نمایشه؟
    visible_for_role = serializers.SerializerMethodField()

    class Meta:
        model = Seminar
        fields = [
            "public_id", "title", "location", "fee",
            "event_date", "event_date_jalali",
            "registration_start_jalali", "registration_end_jalali",
            "poster_url", "allowed_roles",
            "registration_open", "visible_for_role",
        ]

    def get_poster_url(self, obj: Seminar):
        if not obj.poster:
            return None
        # آدرس فایل
        try:
            url = obj.poster.url
        except Exception:
            url = default_storage.url(obj.poster.name)
        # اگر request هست، آدرس مطلق برگردون
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url

    def get_registration_open(self, obj: Seminar):
        return obj.registration_open

    def get_visible_for_role(self, obj: Seminar):
        """
        منطق نمایش:
        - اگر نقش 'club' یا 'heyat' باشه => همیشه True
        - اگر allowed_roles خالی باشه => برای همه True
        - در غیر اینصورت باید role داخل allowed_roles باشه
        نقش از context['role'] گرفته می‌شه.
        """
        role = (self.context.get("role") or "").strip()
        if role in ("club", "heyat"):
            return True
        if not obj.allowed_roles:
            return True
        return role in obj.allowed_roles
