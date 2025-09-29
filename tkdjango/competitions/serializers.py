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
    KyorugiCompetition, CompetitionImage, MatAssignment, Belt, Draw, Match, BeltGroup,
    CompetitionFile, CoachApproval, WeightCategory, Enrollment, Seminar, SeminarRegistration,
    PoomsaeCompetition, PoomsaeDivision, PoomsaeEntry, PoomsaeCoachApproval, PoomsaeType,
)
from django.db import transaction
from django.conf import settings

# پرداخت (اختیاری)
try:
    from payments.models import Payment  # اگر پروژهٔ پرداخت داری
except Exception:
    Payment = None

POOMSAE_ENABLED = getattr(settings, "POOMSAE_ENABLED", True)
POOMSAE_SERIALIZER_ENABLED = getattr(settings, "POOMSAE_SERIALIZER_ENABLED", True)

# وضعیت‌هایی که «کارت» آماده نمایش است
CARD_READY_STATUSES = {"paid", "confirmed", "approved", "accepted", "completed"}

# -------------------------------------------------
# Helpers: جنسیت، ارقام، تاریخ‌ها، کمربند، باشگاه
# -------------------------------------------------
_GENDER_MAP = {
    # male
    "male": "male", "m": "male", "man": "male",
    "آقا": "male", "اقا": "male", "مرد": "male",
    "آقایان": "male", "آقايان": "male", "اقایان": "male",
    # both
    "both": "both", "mixed": "both", "مختلط": "both",
    "هردو": "both", "هر دو": "both",
    # female
    "female": "female", "f": "female", "woman": "female",
    "زن": "female", "خانم": "female", "بانو": "female",
    "بانوان": "female", "خانم‌ها": "female", "خانمها": "female",
}
def _norm_gender(v):
    if v is None:
        return None
    t = str(v).strip().lower().replace("ي", "ی").replace("ك", "ک").replace("‌", "").replace("-", "")
    return _GENDER_MAP.get(t, t)

def _required_gender_for_comp(comp):
    return _norm_gender(getattr(comp, "gender", None))

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
    t = _to_en_digits(str(s)).strip().strip('"').strip("'").replace("-", "/")
    parts = t.split("/")[:3]
    try:
        y, m, d = [int(x) for x in parts]
    except Exception:
        return None
    try:
        if y >= 1700:  # Gregorian
            g = _date(y, m, d)
            return jdatetime.date.fromgregorian(date=g)
        return jdatetime.date(y, m, d)
    except Exception:
        return None

def _to_greg_from_str_jalali(s: str):
    """'YYYY/MM/DD' یا 'YYYY-MM-DD'; سال >=1700 را میلادی فرض کن، وگرنه شمسی→میلادی."""
    if not s:
        return None
    t = _to_en_digits(str(s)).strip().replace("-", "/")
    try:
        jy, jm, jd = [int(x) for x in t.split("/")[:3]]
    except Exception:
        return None
    try:
        if jy >= 1700:
            return _date(jy, jm, jd)
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
    """نام کمربند را به کُد یکتا نگاشت می‌کند؛ «مشکی دان n» → black."""
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

def _player_belt_code_from_profile(prof: UserProfile):
    """white/yellow/green/blue/red/black را از پروفایل استخراج می‌کند (FK، id، یا متن)."""
    b_attr = getattr(prof, "belt", None)
    if isinstance(b_attr, Belt):
        return _norm_belt(getattr(b_attr, "name", None))
    if isinstance(b_attr, int):
        b = Belt.objects.filter(id=b_attr).first()
        if b:
            return _norm_belt(getattr(b, "name", None))
    raw = (
        getattr(prof, "belt_grade", None)
        or getattr(prof, "belt_name", None)
        or getattr(prof, "belt_level", None)
        or getattr(prof, "belt_code", None)
    )
    return _norm_belt(raw)

def _find_belt_group_obj(comp, player_belt_code: str):
    if not comp or not player_belt_code:
        return None
    for g in comp.belt_groups.all().prefetch_related("belts"):
        for b in g.belts.all():
            nm = getattr(b, "name", "") or getattr(b, "label", "")
            if _norm_belt(nm) == player_belt_code:
                return g
    return None

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

def _collect_comp_weights(comp):
    """WeightCategoryهایی که برای مسابقه روی زمین‌ها ست شده‌اند."""
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
    rg = _norm_gender(getattr(comp, "gender", None))
    wg = _norm_gender(wc_gender)
    if rg in (None, "", "both"):
        return True
    if wg in (None, "",):
        return True
    return wg == rg

def _extract_club_profile_and_name(player: UserProfile):
    """خروجی: (club_profile_for_fk, club_name_snapshot)"""
    club_profile = None
    club_name = ""
    raw = getattr(player, "club", None)
    if isinstance(raw, UserProfile) and getattr(raw, "is_club", False):
        club_profile = raw
        club_name = getattr(raw, "club_name", "") or getattr(raw, "full_name", "") or ""
    elif raw is not None:
        club_name = getattr(raw, "club_name", "") or getattr(raw, "name", "") or ""
    if not club_name and isinstance(getattr(player, "club_names", None), list):
        club_name = "، ".join([c for c in player.club_names if c])
    return club_profile, club_name

def _parse_weight_to_float(raw):
    t = _to_en_digits(raw or "")
    for ch in "/٫,،":
        t = t.replace(ch, ".")
    t = "".join(ch for ch in t if (ch.isdigit() or ch == "."))
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
# Competition detail – KYORUGI
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
    lottery_date_jalali       = serializers.SerializerMethodField()  # fallback
    competition_date_jalali   = serializers.SerializerMethodField()

    belt_groups_display = serializers.SerializerMethodField()
    can_register        = serializers.SerializerMethodField()
    user_eligible_self  = serializers.SerializerMethodField()

    allowed_belts       = serializers.SerializerMethodField()
    age_from            = serializers.SerializerMethodField()
    age_to              = serializers.SerializerMethodField()
    eligibility_debug   = serializers.SerializerMethodField()
    bracket_ready       = serializers.SerializerMethodField()
    bracket_stats       = serializers.SerializerMethodField()

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
            "weigh_date_jalali", "draw_date_jalali", "lottery_date_jalali", "competition_date_jalali",
            "belt_groups_display",
            "mat_count",
            "mat_assignments",
            "images", "files",
            "can_register",
            "user_eligible_self",
            "allowed_belts",
            "age_from", "age_to",
            "eligibility_debug",
            "terms_title", "terms_content",
            "bracket_ready", "bracket_stats",
        ]

    def get_terms_title(self, obj):   return obj.terms_template.title if getattr(obj, "terms_template", None) else None
    def get_terms_content(self, obj): return obj.terms_template.content if getattr(obj, "terms_template", None) else None
    def get_registration_start_jalali(self, obj): return _to_jalali_date_str(obj.registration_start)
    def get_registration_end_jalali(self, obj):   return _to_jalali_date_str(obj.registration_end)
    def get_weigh_date_jalali(self, obj):         return _to_jalali_date_str(obj.weigh_date)
    def get_draw_date_jalali(self, obj):          return _to_jalali_date_str(getattr(obj, "draw_date", None))
    def get_lottery_date_jalali(self, obj):
        d = getattr(obj, "lottery_date", None) or getattr(obj, "draw_date", None)
        return _to_jalali_date_str(d)
    def get_competition_date_jalali(self, obj):   return _to_jalali_date_str(obj.competition_date)

    def get_bracket_ready(self, obj):
        if not obj.draws.exists():
            return False
        return not Match.objects.filter(
            draw__competition=obj,
            is_bye=False,
            match_number__isnull=True
        ).exists()

    def get_bracket_stats(self, obj):
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
        return _player_belt_code_from_profile(prof)

    def get_user_eligible_self(self, obj):
        req = self.context.get("request")
        user = getattr(req, "user", None)
        if not user or not user.is_authenticated:
            return False
        prof = self._get_profile(user)
        if not prof:
            return False

        # جنسیت
        rg = _norm_gender(getattr(obj, "gender", None))
        pg = _norm_gender(getattr(prof, "gender", None))
        if rg in (None, "", "both"): gender_ok = True
        elif pg: gender_ok = (rg == pg)
        else: gender_ok = False

        # سن
        dob_j = _parse_jalali_str(getattr(prof, "birth_date", None))
        from_j = _g2j(getattr(obj.age_category, "from_date", None)) if obj.age_category else None
        to_j = _g2j(getattr(obj.age_category, "to_date", None)) if obj.age_category else None
        age_ok = True
        if from_j and to_j:
            age_ok = bool(dob_j and (from_j <= dob_j <= to_j))

        # کمربند
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
            "required_gender": _norm_gender(getattr(obj, "gender", None)),
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
        data["player_gender"] = _norm_gender(getattr(prof, "gender", None))
        rg, pg = data["required_gender"], data["player_gender"]
        data["gender_ok"] = True if rg in (None, "", "both") else (pg and rg == pg)

        dob_j = _parse_jalali_str(getattr(prof, "birth_date", None))
        data["player_dob"] = _j2str(dob_j) if dob_j else None
        from_j = _g2j(getattr(obj.age_category, "from_date", None)) if obj.age_category else None
        to_j = _g2j(getattr(obj.age_category, "to_date", None)) if obj.age_category else None
        data["age_ok"] = bool(dob_j and from_j and to_j and (from_j <= dob_j <= to_j)) if (from_j and to_j) else True

        data["player_belt"] = self._get_player_belt(prof)
        allowed = set(data["allowed_belts"])
        data["belt_ok"] = True if not allowed else bool(data["player_belt"] and data["player_belt"] in allowed)
        return data

# --- Simple serializers for Poomsae attachments
class SimpleImageSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    image = serializers.ImageField()

class SimpleFileSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    file = serializers.FileField()

# -------------------------------------------------
# Competition detail – POOMSAE (eligibility: gender+belt only)
# -------------------------------------------------
class PoomsaeCompetitionDetailSerializer(serializers.ModelSerializer):
    age_categories_display = serializers.SerializerMethodField()
    gender_display     = serializers.CharField(source="get_gender_display", read_only=True)
    belt_level_display = serializers.CharField(source="get_belt_level_display", read_only=True)
    style_display      = serializers.CharField(read_only=True)
    images = SimpleImageSerializer(source="images", many=True, read_only=True)
    files = SimpleFileSerializer(source="files", many=True, read_only=True)

    terms_title   = serializers.SerializerMethodField()
    terms_content = serializers.SerializerMethodField()

    registration_start_jalali = serializers.SerializerMethodField()
    registration_end_jalali   = serializers.SerializerMethodField()
    draw_date_jalali          = serializers.SerializerMethodField()
    lottery_date_jalali       = serializers.SerializerMethodField()
    competition_date_jalali   = serializers.SerializerMethodField()

    belt_groups_display = serializers.SerializerMethodField()
    can_register        = serializers.SerializerMethodField()
    user_eligible_self  = serializers.SerializerMethodField()
    eligibility_debug   = serializers.SerializerMethodField()

    class Meta:
        model  = PoomsaeCompetition
        fields = [
            "id","public_id","title","poster","entry_fee",
            "age_categories_display","gender_display","belt_level_display","style_display",
            "city","address",
            "registration_open",
            "registration_start","registration_end","draw_date","competition_date",
            "registration_start_jalali","registration_end_jalali","draw_date_jalali","lottery_date_jalali","competition_date_jalali",
            "belt_groups_display",
            "images","files",
            "terms_title","terms_content",
            "can_register","user_eligible_self","eligibility_debug",
        ]

    def get_terms_title(self, obj):   return obj.terms_template.title if getattr(obj, "terms_template", None) else None
    def get_terms_content(self, obj): return obj.terms_template.content if getattr(obj, "terms_template", None) else None

    def get_registration_start_jalali(self, obj): return _to_jalali_date_str(obj.registration_start)
    def get_registration_end_jalali(self, obj):   return _to_jalali_date_str(obj.registration_end)
    def get_draw_date_jalali(self, obj):
        d = getattr(obj, "draw_date", None) or getattr(obj, "lottery_date", None)
        return _to_jalali_date_str(d)
    def get_lottery_date_jalali(self, obj):
        d = getattr(obj, "lottery_date", None) or getattr(obj, "draw_date", None)
        return _to_jalali_date_str(d)
    def get_competition_date_jalali(self, obj):   return _to_jalali_date_str(obj.competition_date)

    def get_age_categories_display(self, obj):
        names = list(obj.age_categories.values_list("name", flat=True))
        return "، ".join([n for n in names if n]) if names else ""

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
            UserProfile.objects.filter(user=user, role__in=["player","both"]).first()
            or UserProfile.objects.filter(user=user).first()
        )

    def _get_player_belt(self, prof):
        return _player_belt_code_from_profile(prof)

    def get_user_eligible_self(self, obj):
        """فقط جنسیت و کمربند؛ ردهٔ سنی شرط نیست."""
        req = self.context.get("request")
        user = getattr(req, "user", None)
        if not user or not user.is_authenticated:
            return False
        prof = self._get_profile(user)
        if not prof:
            return False

        # جنسیت
        rg = _norm_gender(getattr(obj, "gender", None))
        pg = _norm_gender(getattr(prof, "gender", None))
        gender_ok = True if rg in (None, "", "both") else (pg and rg == pg)

        # کمربند
        allowed = set(_allowed_belts(obj))
        player_belt = self._get_player_belt(prof)
        belt_ok = True if not allowed else bool(player_belt and player_belt in allowed)

        # سن (نادیده گرفته می‌شود)
        age_ok = True

        return bool(gender_ok and belt_ok and age_ok)

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
            "required_gender": _norm_gender(getattr(obj, "gender", None)),
            "player_gender": None,
            "gender_ok": None,
            "age_categories": list(obj.age_categories.values_list("name", flat=True)),
            "player_dob": None,
            "age_ok": True,  # شرط سن در صلاحیت پومسه لحاظ نمی‌شود
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
        data["player_gender"] = _norm_gender(getattr(prof, "gender", None))
        rg, pg = data["required_gender"], data["player_gender"]
        data["gender_ok"] = True if rg in (None, "", "both") else (pg and rg == pg)

        jd = _parse_jalali_str(getattr(prof, "birth_date", None))
        data["player_dob"] = _j2str(jd) if jd else None

        data["player_belt"] = _player_belt_code_from_profile(prof)
        allowed = set(data["allowed_belts"])
        data["belt_ok"] = True if not allowed else bool(data["player_belt"] and data["player_belt"] in allowed)
        return data

# -------------------------------------------------
# Register-self – KYORUGI (بدون Division)
# -------------------------------------------------
def _allowed_belts(obj):
    """از belt_groups یا belt_level قدیمی می‌خوانیم (بدون Division)."""
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

    def _player_belt_code(self, prof: UserProfile):
        return _player_belt_code_from_profile(prof)

    def validate(self, attrs):
        comp = self._competition
        req = self._request
        if not comp:
            raise serializers.ValidationError({"__all__": "مسابقه یافت نشد."})

        # بازهٔ ثبت‌نام
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

        # جلوگیری از تکرار
        if Enrollment.objects.filter(competition=comp, player=player).exists():
            raise serializers.ValidationError({"__all__": "برای این مسابقه قبلاً ثبت‌نام کرده‌اید."})

        # تاریخ بیمه (≥ ۷۲ ساعت قبل)
        issue_g = _to_greg_from_str_jalali(attrs.get("insurance_issue_date"))
        if not issue_g:
            raise serializers.ValidationError({"insurance_issue_date": "تاریخ صدور نامعتبر است (مثلاً ۱۴۰۳/۰۵/۲۰)."})
        if comp.competition_date and issue_g > (comp.competition_date - timedelta(days=3)):
            raise serializers.ValidationError({"insurance_issue_date": "تاریخ صدور باید حداقل ۷۲ ساعت قبل از برگزاری باشد."})
        self._issue_date_greg = issue_g

        # وزن
        try:
            w = _parse_weight_to_float(attrs.get("declared_weight") or "")
        except Exception:
            raise serializers.ValidationError({"declared_weight": "وزن نامعتبر است."})
        self._declared_weight_float = w

        # کد مربی در کیوروگی: طبق تنظیم مسابقه
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

        # گروه کمربندی سازگار
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
            code = self._player_belt_code(player)
            if code:
                belt_group = _find_belt_group_obj(comp, code)
        if comp.belt_groups.exists() and not belt_group:
            raise serializers.ValidationError({"belt_group": "کمربند شما با گروه‌های مسابقه سازگار نیست."})
        self._belt_group = belt_group

        # انتخاب رده وزنی
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

        club_obj   = getattr(player, "club", None)
        club_name  = getattr(club_obj, "club_name", "") or ""
        board_obj  = getattr(player, "tkd_board", None)
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

            belt_group=self._belt_group,
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
# Dashboard – KYORUGI list item
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
    lottery_date_jalali       = serializers.SerializerMethodField()
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
            "weigh_date_jalali", "draw_date_jalali", "lottery_date_jalali", "competition_date_jalali",
            "can_register", "status",
        ]

    def get_registration_start_jalali(self, obj): return _to_jalali_date_str(obj.registration_start)
    def get_registration_end_jalali(self, obj):   return _to_jalali_date_str(obj.registration_end)
    def get_weigh_date_jalali(self, obj):         return _to_jalali_date_str(obj.weigh_date)
    def get_draw_date_jalali(self, obj):
        d = getattr(obj, "draw_date", None) or getattr(obj, "lottery_date", None)
        return _to_jalali_date_str(d)
    def get_lottery_date_jalali(self, obj):
        d = getattr(obj, "lottery_date", None) or getattr(obj, "draw_date", None)
        return _to_jalali_date_str(d)
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
    belt       = serializers.SerializerMethodField()
    belt_group = serializers.SerializerMethodField()

    insurance_number = serializers.CharField(read_only=True)
    insurance_issue_date_jalali = serializers.SerializerMethodField()

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
        jd = _parse_jalali_str(bd)
        if jd:
            return _j2str(jd)
        g = _to_greg_from_str_jalali(bd)
        return _to_jalali_date_str(g) if g else str(bd)

    def get_photo(self, obj):
        request = self.context.get("request")
        prof = obj.player
        cand = getattr(prof, "profile_image", None)
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

# -------------------------------------------------
# Bracket API
# -------------------------------------------------
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
    if not comp.draws.exists():
        return False
    return not Match.objects.filter(
        draw__competition=comp, is_bye=False, match_number__isnull=True
    ).exists()

def _bracket_stats_for(comp):
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
    def to_representation(self, comp):
        from .models import Match, Draw
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

# -------------------------------------------------
# Seminars
# -------------------------------------------------
def _to_jalali_str(d):
    if not d:
        return None
    if isinstance(d, _datetime):
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
    if digits.startswith("0098"):
        digits = digits[4:]
    elif digits.startswith("98"):
        digits = digits[2:]
    elif digits.startswith("+98"):
        digits = digits[3:]
    if len(digits) == 10 and digits.startswith("9"):
        digits = "0" + digits
    return digits

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

    def get_registration_start_jalali(self, obj): return _to_jalali_str(obj.registration_start)
    def get_registration_end_jalali(self, obj):   return _to_jalali_str(obj.registration_end)
    def get_event_date_jalali(self, obj):         return _to_jalali_str(obj.event_date)
    def get_poster_url(self, obj):
        req = self.context.get('request')
        return _abs_url(req, obj.poster) if req else (obj.poster.url if getattr(obj.poster, "url", None) else None)
    def get_is_open_for_registration(self, obj):
        today = timezone.localdate()
        if not obj.registration_start or not obj.registration_end:
            return False
        return obj.registration_start <= today <= obj.registration_end

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

        today = timezone.localdate()
        if not (seminar.registration_start <= today <= seminar.registration_end):
            raise serializers.ValidationError({"seminar": "ثبت‌نام این سمینار فعال نیست یا خارج از بازه است."})

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

        phone = attrs.get('phone')
        if not phone and hasattr(user, "userprofile"):
            phone = getattr(user.userprofile, "phone", None)
        phone_norm = _normalize_iran_mobile(phone) if phone else None
        if not phone_norm:
            raise serializers.ValidationError({"phone": "شماره موبایل الزامی است."})
        if not (len(phone_norm) == 11 and phone_norm.startswith("09")):
            raise serializers.ValidationError({"phone": "شماره موبایل نامعتبر است. نمونه صحیح: 09123456789"})
        attrs['phone'] = phone_norm

        exists = SeminarRegistration.objects.filter(seminar=seminar, user=user).exists()
        if exists:
            raise serializers.ValidationError({"seminar": "شما قبلاً در این سمینار ثبت‌نام کرده‌اید."})

        return attrs

    def create(self, validated_data):
        reg = super().create(validated_data)
        try:
            if getattr(reg.seminar, "fee", 0) == 0:
                reg.mark_paid(amount=0)
        except AttributeError:
            pass
        return reg

class SeminarCardSerializer(serializers.ModelSerializer):
    poster_url = serializers.SerializerMethodField()
    event_date_jalali = serializers.ReadOnlyField()
    registration_start_jalali = serializers.ReadOnlyField()
    registration_end_jalali = serializers.ReadOnlyField()
    registration_open = serializers.SerializerMethodField()
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
        try:
            url = obj.poster.url
        except Exception:
            url = default_storage.url(obj.poster.name)
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url

    def get_registration_open(self, obj: Seminar):
        return obj.registration_open

    def get_visible_for_role(self, obj: Seminar):
        role = (self.context.get("role") or "").strip()
        if role in ("club", "heyat"):
            return True
        if not obj.allowed_roles:
            return True
        return role in obj.allowed_roles

# -------------------------------------------------
# POOMSAE – Dashboard card
# -------------------------------------------------
class DashboardPoomsaeCompetitionSerializer(serializers.ModelSerializer):
    age_categories_display  = serializers.SerializerMethodField()
    gender_display     = serializers.CharField(source="get_gender_display", read_only=True)
    belt_level_display = serializers.CharField(source="get_belt_level_display", read_only=True)
    style_display      = serializers.CharField(read_only=True)

    registration_start_jalali = serializers.SerializerMethodField()
    registration_end_jalali   = serializers.SerializerMethodField()
    draw_date_jalali          = serializers.SerializerMethodField()
    lottery_date_jalali       = serializers.SerializerMethodField()
    competition_date_jalali   = serializers.SerializerMethodField()

    can_register = serializers.SerializerMethodField()
    status       = serializers.SerializerMethodField()

    class Meta:
        model = PoomsaeCompetition
        fields = [
            "id", "public_id",
            "title", "poster", "entry_fee",
            "age_categories_display", "gender_display", "belt_level_display",
            "style_display",
            "city",
            "registration_open",
            "registration_start", "registration_end",
            "draw_date", "competition_date",
            "registration_start_jalali", "registration_end_jalali",
            "draw_date_jalali", "lottery_date_jalali", "competition_date_jalali",
            "can_register", "status",
        ]

    def get_age_categories_display(self, obj):
        names = list(obj.age_categories.values_list("name", flat=True))
        return "، ".join([n for n in names if n]) if names else ""

    def get_registration_start_jalali(self, obj): return _to_jalali_date_str(obj.registration_start)
    def get_registration_end_jalali(self, obj):   return _to_jalali_date_str(obj.registration_end)
    def get_draw_date_jalali(self, obj):          return _to_jalali_date_str(getattr(obj, "draw_date", None))
    def get_lottery_date_jalali(self, obj):
        d = getattr(obj, "lottery_date", None) or getattr(obj, "draw_date", None)
        return _to_jalali_date_str(d)
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
# POOMSAE – ثبت‌نام انفرادی (coach_code اجباری و دقیق)
# -------------------------------------------------
def _age_on(dob: _date | None, on: _date | None) -> int | None:
    if not dob or not on: return None
    y = on.year - dob.year
    if (on.month, on.day) < (dob.month, dob.day): y -= 1
    return max(0, y)

def _parse_iso(s: str) -> _date | None:
    try:
        return _date.fromisoformat(str(s)[:10])
    except Exception:
        return None

def _get_or_create_poomsae_division(comp, gender, age_category, belt_group, poomsae_type):
    kwargs = dict(
        competition=comp,
        gender=gender,
        age_category=age_category,
        poomsae_type=poomsae_type,
    )
    if belt_group is not None:
        kwargs["belt_group"] = belt_group
    return PoomsaeDivision.objects.get_or_create(**kwargs)

class PoomsaeSelfRegistrationSerializer(serializers.Serializer):
    poomsae_type = serializers.ChoiceField(choices=[("standard","standard"),("creative","creative")])
    insurance_number = serializers.CharField(max_length=32)
    insurance_issue_date = serializers.DateField()  # فرانت ISO می‌فرستد
    coach_code = serializers.CharField(max_length=12, required=True)

    # context: request, competition (PoomsaeCompetition)
    def _get_profile(self, user):
        return (getattr(user, "userprofile", None)
                or getattr(user, "profile", None)
                or UserProfile.objects.filter(user=user).first())

    def validate(self, attrs):
        req = self.context["request"]
        comp: PoomsaeCompetition = self.context["competition"]
        prof = self._get_profile(req.user)
        if not prof:
            raise serializers.ValidationError({"__all__": "پروفایل بازیکن یافت نشد."})

        # پنجره ثبت‌نام
        today = timezone.localdate()
        rs = comp.registration_start
        re_ = comp.registration_end
        in_window = bool(comp.registration_open and (not rs or rs <= today) and (not re_ or today <= re_))
        if not in_window:
            raise serializers.ValidationError({"__all__": "ثبت‌نام این مسابقه فعال نیست یا خارج از بازه است."})

        # کد مربی — باید دقیقاً کد مربی خودِ بازیکن در همین مسابقه باشد
        code = str(attrs.get("coach_code", "")).strip()
        appr = PoomsaeCoachApproval.objects.filter(
            competition=comp, coach=getattr(prof, "coach", None),
            terms_accepted=True, is_active=True
        ).first()
        if not (appr and appr.code and code == appr.code):
            raise serializers.ValidationError({"coach_code": "کد تأیید مربی نامعتبر است."})

        # بیمه: بین ۱ سال تا ۳ روز قبل از تاریخ مسابقه
        issue: _date = attrs["insurance_issue_date"]
        comp_date = comp.competition_date or today
        min_ok = comp_date - timedelta(days=365)
        max_ok = comp_date - timedelta(days=3)
        if issue < min_ok or issue > max_ok:
            raise serializers.ValidationError({"insurance_issue_date": "تاریخ صدور بیمه باید بین ۱ سال تا ۳ روز قبل از مسابقه باشد."})

        # وجود تاریخ تولد و کمربند در پروفایل (برای تعیین Division، حتی اگر شرط سن برای eligibility لازم نباشد)
        dob = getattr(prof, "birth_date", None)
        if isinstance(dob, _datetime): dob = dob.date()
        if not dob:
            raise serializers.ValidationError({"__all__": "تاریخ تولد در پروفایل ثبت نشده است."})
        if not getattr(prof, "belt", None) and not getattr(prof, "belt_name", None):
            raise serializers.ValidationError({"__all__": "کمربند در پروفایل ثبت نشده است."})

        return attrs

    def _resolve_division(self, comp: PoomsaeCompetition, prof: UserProfile, poomsae_type: str):
        """یافتن Division مناسب بر اساس سن، کمربند و نوع مسابقه (اختیاری)."""
        # 1) سن در تاریخ برگزاری
        dob = getattr(prof, "birth_date", None)
        if isinstance(dob, _datetime): dob = dob.date()
        age = _age_on(dob, comp.competition_date or timezone.localdate())

        # 2) گروه سنی (اگر تعریف شده)
        age_cat = None
        if hasattr(comp, "age_categories") and comp.age_categories.exists():
            for a in comp.age_categories.all():
                mn = getattr(a, "min_age", None)
                mx = getattr(a, "max_age", None)
                if (mn is not None and mx is not None and age is not None) and (mn <= age <= mx):
                    age_cat = a
                    break

        # 3) گروه کمربندی
        belt_label = getattr(prof, "belt", None) or getattr(prof, "belt_name", None) or getattr(prof, "belt_label", None)
        belt_code = _norm_belt(getattr(belt_label, "name", None) or str(belt_label))
        belt_group = None
        if hasattr(comp, "belt_groups") and comp.belt_groups.exists():
            for g in comp.belt_groups.all().prefetch_related("belts"):
                for b in g.belts.all():
                    nm = getattr(b, "name", "") or getattr(b, "label", "")
                    if _norm_belt(nm) == belt_code:
                        belt_group = g
                        break
                if belt_group: break

        # 4) Division دقیق (اگر موجود باشد)
        div = PoomsaeDivision.objects.filter(
            competition=comp,
            age_category=age_cat if age_cat else None,
            belt_group=belt_group if belt_group else None,
            poomsae_type=poomsae_type,
        ).first()

        return div, age_cat, belt_group

    @transaction.atomic
    def save(self):
        req = self.context["request"]
        comp: PoomsaeCompetition = self.context["competition"]
        prof = self._get_profile(req.user)

        poomsae_type = self.validated_data["poomsae_type"]
        ins_no = str(self.validated_data["insurance_number"]).strip()
        ins_issue = self.validated_data["insurance_issue_date"]

        # انتخاب Division (اگر موجود نباشد، Entry بدون division ثبت می‌شود تا اپراتور تخصیص دهد)
        div, age_cat, belt_group = self._resolve_division(comp, prof, poomsae_type)

        # ایجاد Entry
        entry = PoomsaeEntry.objects.create(
            competition=comp,
            player=prof,
            division=div,
            poomsae_type=poomsae_type,
            insurance_number=ins_no,
            insurance_issue_date=ins_issue,
            coach=getattr(prof, "coach", None),
            belt_group=belt_group if hasattr(PoomsaeEntry, "belt_group") else None,
            age_category=age_cat if hasattr(PoomsaeEntry, "age_category") else None,
            status="pending_payment",
        )

        # ساخت پرداخت (در صورت داشتن هزینه)
        amount = int(getattr(comp, "entry_fee", 0) or 0)
        payment_url = None
        if amount > 0 and Payment is not None:
            try:
                pay = Payment.objects.create(
                    user=req.user,
                    amount=amount,
                    status="unpaid",
                    gateway="saman",  # مطابق راه‌اندازی نهایی‌ات تغییر بده
                    description=f"ورودی مسابقه پومسه - {comp.title}",
                    # اگر فیلدهای ارتباطی ContentType داری، ست کن (مثلاً competition/entry)
                )
                if hasattr(pay, "get_start_url"):
                    payment_url = pay.get_start_url()
            except Exception:
                payment_url = None
        elif amount == 0:
            entry.status = "paid"
            entry.save(update_fields=["status"])

        self._entry = entry
        self._payment_url = payment_url
        return entry

    def to_representation(self, entry: PoomsaeEntry):
        data = {
            "enrollment_id": entry.id,
            "status": entry.status,
            "amount": int(getattr(self.context["competition"], "entry_fee", 0) or 0),
        }
        if self._payment_url:
            data["payment_url"] = self._payment_url
        return data

# -------------------------------------------------
# Enrollment (لیست سبک)
# -------------------------------------------------
class EnrollmentLiteSerializer(serializers.ModelSerializer):
    first_name = serializers.CharField(source="player.first_name", read_only=True)
    last_name  = serializers.CharField(source="player.last_name", read_only=True)
    belt_group_label = serializers.CharField(source="belt_group.label", read_only=True)
    age_category_name = serializers.SerializerMethodField()

    class Meta:
        model = Enrollment
        fields = ["id","first_name","last_name","belt_group_label","age_category_name","is_paid","paid_amount"]

    def get_age_category_name(self, obj):
        comp = obj.competition
        return getattr(getattr(comp, "age_category", None), "name", None)
