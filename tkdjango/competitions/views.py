# --- stdlib
import logging
import re
from collections import defaultdict

# زمان/تاریخ
from datetime import date as _date, datetime as _datetime, time as _time, timedelta

# --- third-party
import jdatetime

# --- Django / DRF
from django.apps import apps
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import FieldError, ValidationError
from django.db import transaction, IntegrityError
from django.db import models as djm
from django.db.models import Q, Exists, OuterRef
from django.db.utils import OperationalError, ProgrammingError
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.timezone import now

from rest_framework import views, viewsets, generics, permissions, status, parsers
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

# --- Project models
from accounts.models import UserProfile, TkdClub, TkdBoard
from .models import (
    KyorugiCompetition, CoachApproval, Enrollment, Draw, Match,
    WeightCategory, BeltGroup, Belt, KyorugiResult, Seminar, SeminarRegistration,
    PoomsaeCompetition, PoomsaeCoachApproval,
)

# --- Project permissions
from .permissions import IsCoach, IsPlayer

# --- Project serializers
from .serializers import (
     KyorugiCompetitionDetailSerializer,
     CompetitionRegistrationSerializer,
     EnrollmentCardSerializer,
     KyorugiBracketSerializer,
     EnrollmentLiteSerializer,
     _norm_belt, _player_belt_code_from_profile, _norm_gender, _allowed_belts,
     SeminarSerializer, SeminarRegistrationSerializer, SeminarCardSerializer,
     DashboardAnyCompetitionSerializer, PoomsaeCompetitionDetailSerializer,PoomsaeRegistrationSerializer
)

# وضعیت‌هایی که کارت آماده نمایش است
CARD_READY_STATUSES = {"paid", "confirmed", "approved", "accepted", "completed"}

# ------------------------------------------------------------------------------------
# Helpers (local)
# ------------------------------------------------------------------------------------


# --- بالای فایل، کنار بقیه‌ی هلسپرها اضافه کن
def _birth_jalali_from_profile(p: UserProfile) -> str:
    """
    تاریخ تولد ثبت‌شده در پروفایل (که ممکنه جلالیِ استرینگ باشه) رو
    به صورت جلالی استاندارد YYYY/MM/DD برای نمایش برمی‌گردونه.
    """
    g = _player_birthdate_to_gregorian(p)
    if not g:
        return ""
    try:
        return jdatetime.date.fromgregorian(date=g).strftime("%Y/%m/%d")
    except Exception:
        return ""

# ------------------------------------------------------------------------------------
def _poomsae_user_eligible(user, comp):
    """صلاحیت بازیکن برای پومسه: جنسیت + بازه‌های سنی (M2M و FK) + کمربند."""
    prof = UserProfile.objects.filter(user=user, role__in=["player","both"])\
                              .only("gender","birth_date","belt_grade").first()
    if not prof:
        return False

    # جنسیت
    req_gender = _required_gender_for_comp(comp)
    gender_ok  = (req_gender in (None, "", "both")) or (_gender_norm(prof.gender) == req_gender)

    # سن (پوشش M2M و FK)
    wins = []
    try:
        wins += [(ac.from_date, ac.to_date) for ac in comp.age_categories.all()]
    except Exception:
        pass
    if not wins and getattr(comp, "age_category_id", None):
        ac = comp.age_category
        wins = [(ac.from_date, ac.to_date)]

    bd = _player_birthdate_to_gregorian(prof)
    age_ok = True if not wins else bool(bd and any(fr and to and fr <= bd <= to for fr, to in wins))

    # کمربند
    allowed_codes = set(_allowed_belts(comp))
    player_code   = _player_belt_code_from_profile(prof)
    belt_ok = True if not allowed_codes else bool(player_code and player_code in allowed_codes)

    return bool(gender_ok and age_ok and belt_ok)

def _age_groups_display_for(comp) -> str:
    """نمایش گروه‌های سنی برای پومسه/کیوروگی (M2M یا FK)."""
    names = []
    try:
        if hasattr(comp, "age_categories") and comp.age_categories.exists():
            names = list(comp.age_categories.values_list("name", flat=True))
    except Exception:
        pass
    if not names:
        ac = getattr(comp, "age_category", None)
        if ac:
            nm = getattr(ac, "name", None)
            if nm:
                names = [nm]
    return "، ".join([n for n in names if n]) if names else ""

def _uniq_preserve(seq):
    seen, out = set(), []
    for x in seq:
        s = (x or "").strip()
        if not s or s in seen:
            continue
        seen.add(s)
        out.append(s)
    return out

def _detect_role_and_profile(request):
    prof = UserProfile.objects.filter(user=request.user).first()
    if prof and prof.role:
        return (prof.role or "").lower(), prof
    if TkdClub.objects.filter(user=request.user).exists():
        return "club", None
    if request.user.groups.filter(name__iexact="heyat").exists():
        return "heyat", None
    if request.user.groups.filter(name__iexact="board").exists():
        return "board", None
    return "", prof

def registration_open_effective(obj):
    """
    True/False بر اساس:
    1) registration_manual: اگر True/False ست شده باشد همانی برمی‌گردد
    2) در غیر این صورت، چک بازه زمانی (Date یا DateTime)
    3) در نبود بازه، False
    """
    try:
        manual = getattr(obj, "registration_manual", None)
        if manual is True:
            return True
        if manual is False:
            return False

        # تشخیص نوع فیلد شروع
        try:
            f = obj._meta.get_field("registration_start")
            is_dt = isinstance(f, djm.DateTimeField)
        except Exception:
            is_dt = False

        rs = getattr(obj, "registration_start", None)
        re_ = getattr(obj, "registration_end", None)
        if not (rs and re_):
            return False

        nowv = timezone.now() if is_dt else timezone.localdate()
        return bool(rs <= nowv <= re_)
    except Exception:
        return False

def _opened(qs, only_open: bool):
    """فیلتر کردن کوئری به «بازهای مؤثر» در صورت نیاز (Date/DateTime + اجبار دستی)."""
    if not only_open:
        return qs

    Model = qs.model
    fields = {f.name: f for f in Model._meta.get_fields() if hasattr(f, "attname")}

    needed = {"registration_manual", "registration_start", "registration_end"}
    if not needed.issubset(fields.keys()):
        # این مدل مفهوم باز/بسته ندارد
        return qs

    # تشخیص نوع فیلد تاریخ شروع
    has_dt = isinstance(fields.get("registration_start"), djm.DateTimeField)

    if has_dt:
        nowdt = timezone.now()
        open_q = (
            Q(registration_manual=True) |
            (Q(registration_manual__isnull=True) &
             Q(registration_start__lte=nowdt) &
             Q(registration_end__gte=nowdt))
        )
    else:
        today = timezone.localdate()
        open_q = (
            Q(registration_manual=True) |
            (Q(registration_manual__isnull=True) &
             Q(registration_start__lte=today) &
             Q(registration_end__gte=today))
        )

    return qs.filter(open_q)

def _dashboard_base_qs(role, profile, only_open):
    ky_qs = KyorugiCompetition.objects.all()
    po_qs = PoomsaeCompetition.objects.all()

    if role == "player":
        if not (profile and profile.coach):
            return KyorugiCompetition.objects.none(), PoomsaeCompetition.objects.none()

        ky_qs = ky_qs.filter(
            coach_approvals__coach=profile.coach,
            coach_approvals__is_active=True,
            coach_approvals__terms_accepted=True,
        ).distinct()

        # پومسه: approved (نه terms_accepted)
        try:
            po_qs = po_qs.filter(
                coach_approvals__coach=profile.coach,
                coach_approvals__is_active=True,
                coach_approvals__approved=True,
            ).distinct()
        except FieldError:
            po_qs = po_qs.filter(
                coach_approvals__coach=profile.coach,
                coach_approvals__is_active=True,
            ).distinct()

        return _opened(ky_qs, only_open), _opened(po_qs, only_open)

    if role == "referee":
        return _opened(ky_qs, True), _opened(po_qs, True)

    return _opened(ky_qs, only_open), _opened(po_qs, only_open)

def _to_aware_dt(v):
    if v is None:
        return timezone.now()
    if isinstance(v, _date) and not isinstance(v, _datetime):
        v = _datetime.combine(v, _time.min)
    if timezone.is_naive(v):
        v = timezone.make_aware(v, timezone.get_current_timezone())
    return v

def _order_items(items):
    def _key(x):
        v = (getattr(x, "created_at", None)
             or getattr(x, "competition_date", None)
             or getattr(x, "event_date", None))
        v = _to_aware_dt(v)
        return v.timestamp()
    return sorted(items, key=_key, reverse=True)

def _get_comp_by_key(key):
    s = str(key).strip()
    qs = KyorugiCompetition.objects.all()
    if s.isdigit():
        obj = qs.filter(id=int(s)).first()
        if obj:
            return obj
    obj = qs.filter(public_id__iexact=s).first()
    if obj:
        return obj
    raise Http404("KyorugiCompetition not found")

def _get_comp_by_key_any(key):
    s = str(key).strip()
    try:
        return _get_comp_by_key(key)
    except Http404:
        pass

    if s.isdigit():
        obj = PoomsaeCompetition.objects.filter(id=int(s)).first()
        if obj:
            return obj

    obj = PoomsaeCompetition.objects.filter(public_id__iexact=s).first()
    if obj:
        return obj

    try:
        obj = PoomsaeCompetition.objects.filter(slug__iexact=s).first()
        if obj:
            return obj
    except Exception:
        pass
    raise Http404("Competition not found")

def _required_gender_for_comp(comp):
    g = getattr(comp, "gender", None)
    if not g:
        return None
    t = str(g).strip().lower().replace("‌", "").replace("-", "")
    mapping = {
        "m": "male", "male": "male", "man": "male", "آقا": "male", "اقا": "male", "مرد": "male", "آقایان": "male",
        "f": "female", "female": "female", "woman": "female", "زن": "female", "خانم": "female", "بانوان": "female",
        "both": "both", "mixed": "both", "مختلط": "both", "هر دو": "both", "هردو": "both",
    }
    return mapping.get(t, t)

def _gender_norm(val):
    m = {
        "male":"male","m":"male","man":"male","boy":"male","مرد":"male","آقا":"male",
        "female":"female","f":"female","woman":"female","girl":"female","زن":"female","خانم":"female",
        "both":"both","mix":"both", "":None, None:None
    }
    return m.get(str(val).strip().lower(), None)

def _parse_jalali_ymd(s: str) -> _date | None:
    if not s:
        return None
    t = re.sub(r"[\u200e\u200f\u200c\u202a-\u202e]", "", str(s))
    t = t.replace("-", "/")
    t = t.translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩","01234567890123456789"))
    m = re.fullmatch(r"(\d{4})/(\d{1,2})/(\d{1,2})", t)
    if not m: return None
    jy, jm, jd = map(int, m.groups())
    try:
        g = jdatetime.date(jy, jm, jd).togregorian()
        return _date(g.year, g.month, g.day)
    except Exception:
        return None

def _player_birthdate_to_gregorian(p: UserProfile):
    return _parse_jalali_ymd(p.birth_date)

def _allowed_belt_names_for_comp(comp: KyorugiCompetition):
    if comp.belt_groups.exists():
        belts = set()
        qs = BeltGroup.objects.filter(id__in=comp.belt_groups.values_list("id", flat=True)).prefetch_related("belts")
        for g in qs:
            belts.update(list(g.belts.values_list("name", flat=True)))
        return belts

    if comp.belt_level == "yellow_blue":
        return {"سفید", "زرد", "سبز", "آبی"}
    if comp.belt_level == "red_black":
        return {"قرمز"} | {f"مشکی دان {i}" for i in range(1, 11)}
    return {"سفید", "زرد", "سبز", "آبی", "قرمز"} | {f"مشکی دان {i}" for i in range(1, 11)}

def _age_ok_for_comp(p: UserProfile, comp: KyorugiCompetition):
    bd = _player_birthdate_to_gregorian(p)
    if not bd:
        return False
    cat = comp.age_category
    if not cat:
        return True
    return (cat.from_date <= bd <= cat.to_date)

def _find_weight_category_for(comp: KyorugiCompetition, gender: str, declared_weight: float):
    ids = comp.allowed_weight_ids()
    if not ids:
        return None
    qs = WeightCategory.objects.filter(id__in=ids, gender=gender).order_by("min_weight")
    for wc in qs:
        if wc.includes_weight(float(declared_weight)):
            return wc
    return None

def _coach_from_request(request):
    return UserProfile.objects.filter(user=request.user, role__in=["coach", "both"]).first()

def _allowed_belt_names(comp: KyorugiCompetition) -> set[str]:
    if comp.belt_groups.exists():
        return set(Belt.objects.filter(
            beltgroup__in=comp.belt_groups.all()
        ).values_list("name", flat=True))
    return set(Belt.objects.values_list("name", flat=True))

def _allowed_belt_names_for_any_comp(comp):
    names = set()
    try:
        if getattr(comp, "belt_groups", None) and comp.belt_groups.exists():
            names = set(
                Belt.objects.filter(beltgroup__in=comp.belt_groups.all())
                .values_list("name", flat=True)
            )
    except Exception:
        names = set()

    if not names:
        lvl = (getattr(comp, "belt_level", "") or "").lower()
        if lvl in ("yellow_blue", "yellow-to-blue"):
            names = {"سفید", "زرد", "سبز", "آبی"}
        elif lvl in ("red_black", "red-to-black"):
            names = {"قرمز"} | {f"مشکی دان {i}" for i in range(1, 11)}
    return names

def _enr_label(e):
    if not e:
        return None
    player_name = ""
    club_name = None
    try:
        player_name = f"{getattr(e.player,'first_name','') or ''} {getattr(e.player,'last_name','') or ''}".strip()
    except Exception:
        pass
    try:
        club_name = getattr(e.club, "club_name", None) or getattr(e.club, "name", None)
    except Exception:
        pass
    label = f"{player_name} — {club_name}" if player_name and club_name else (player_name or club_name or "—")
    return {
        "enrollment_id": e.id,
        "player_name": player_name or None,
        "club_name": club_name or None,
        "label": label,
    }

# ------------------------------------------------------------------------------------
# Views
# ------------------------------------------------------------------------------------
class CompetitionDetailAnyView(views.APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [permissions.AllowAny]

    def get(self, request, key):
        comp = _get_comp_by_key_any(key)

        # ----------------------- KYORUGI -----------------------
        if isinstance(comp, KyorugiCompetition):
            ser = KyorugiCompetitionDetailSerializer(comp, context={"request": request})
            data = dict(ser.data)
            data["kind"] = "kyorugi"

            if request.user and request.user.is_authenticated:
                # my_enrollment (قدیمی)
                player = UserProfile.objects.filter(user=request.user, role__in=["player", "both"]).first()
                if player:
                    enr = (Enrollment.objects
                           .only("id","status","player_id","competition_id")
                           .filter(competition=comp, player=player)
                           .order_by("-id")
                           .first())
                    if enr:
                        data["my_enrollment"] = {"id": enr.id, "status": enr.status}
                        data["card_ready"] = enr.status in CARD_READY_STATUSES
                    else:
                        data["my_enrollment"] = None
                        data["card_ready"] = False

                    # ✅ my_profile با کدملی و تاریخ تولد (جلالی)
                    birth_text = _birth_jalali_from_profile(player)
                    belt_val = getattr(player, "belt_grade", "") or getattr(player, "belt_name", "") or ""
                    data["my_profile"] = {
                        "gender": player.gender,
                        "belt": belt_val,
                        "national_code": getattr(player, "national_code", "") or "",
                        "birth_date": birth_text,
                        # نسخه‌های camelCase برای سازگاری کلاینت‌ها
                        "nationalCode": getattr(player, "national_code", "") or "",
                        "birthDate": birth_text,
                    }

            return Response(data, status=status.HTTP_200_OK)

        # ----------------------- POOMSAE -----------------------
        ser = PoomsaeCompetitionDetailSerializer(comp, context={"request": request})
        data = dict(ser.data)
        data["kind"] = "poomsae"

        _age_txt = _age_groups_display_for(comp)
        _note = "ثبت نام تیم پومسه بر عهده مربی می‌باشد"
        data["age_groups_display"] = _age_txt
        data["ageGroupsDisplay"] = _age_txt
        data["age_category_name"] = _age_txt
        data["team_registration_by"] = "coach"
        data["teamRegistrationBy"] = "coach"
        data["team_registration_note"] = _note
        data["teamRegistrationNote"] = _note

        if request.user and request.user.is_authenticated:
            coach = UserProfile.objects.filter(user=request.user, role__in=["coach", "both"]).first()
            if coach:
                appr = PoomsaeCoachApproval.objects.filter(
                    competition=comp, coach=coach, is_active=True
                ).first()
                data["my_coach_approval"] = {
                    "approved": bool(appr and appr.approved),
                    "code": appr.code if appr and appr.is_active else None,
                }

            # ✅ my_profile برای پومسه: اضافه شدن national_code و birth_date (جلالی)
            player = UserProfile.objects.filter(user=request.user, role__in=["player", "both"]) \
                .only("gender", "belt_grade", "national_code", "birth_date").first()
            if player:
                birth_text = _birth_jalali_from_profile(player)
                belt_val = getattr(player, "belt_grade", "") or getattr(player, "belt_name", "") or ""
                data["my_profile"] = {
                    "gender": player.gender,
                    "belt": belt_val,
                    "national_code": getattr(player, "national_code", "") or "",
                    "birth_date": birth_text,
                    # camelCase
                    "nationalCode": getattr(player, "national_code", "") or "",
                    "birthDate": birth_text,
                }

            data["registration_open"] = bool(registration_open_effective(comp))
            data["user_eligible_self"] = _poomsae_user_eligible(request.user, comp)

        return Response(data, status=status.HTTP_200_OK)


# ---------- جزئیات مسابقه (کیوروگی) ----------
class KyorugiCompetitionDetailView(views.APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [permissions.AllowAny]

    def get(self, request, key):
        comp = _get_comp_by_key(key)
        ser = KyorugiCompetitionDetailSerializer(comp, context={"request": request})
        data = dict(ser.data)

        if request.user and request.user.is_authenticated:
            player = UserProfile.objects.filter(user=request.user, role__in=["player", "both"]).first()
            if player:
                enr = (Enrollment.objects
                       .only("id","status","player_id","competition_id")
                       .filter(competition=comp, player=player)
                       .order_by("-id")
                       .first())
                if enr:
                    data["my_enrollment"] = {"id": enr.id, "status": enr.status}
                    data["card_ready"] = enr.status in CARD_READY_STATUSES
                else:
                    data["my_enrollment"] = None
                    data["card_ready"] = False

                # ✅ my_profile شامل تاریخ تولد (و کدملی برای یکدستی)
                birth_text = _birth_jalali_from_profile(player)
                belt_val = getattr(player, "belt_grade", "") or getattr(player, "belt_name", "") or ""
                data["my_profile"] = {
                    "gender": player.gender,
                    "belt": belt_val,
                    "national_code": getattr(player, "national_code", "") or "",
                    "birth_date": birth_text,
                    "nationalCode": getattr(player, "national_code", "") or "",
                    "birthDate": birth_text,
                }

        return Response(data, status=status.HTTP_200_OK)

# ---------- ثبت‌نام خودِ بازیکن ----------
class RegisterSelfView(views.APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [permissions.IsAuthenticated, IsPlayer]

    @transaction.atomic
    def post(self, request, key):
        comp = _get_comp_by_key(key)

        # گیت باز/بسته بودن ثبت‌نام با هلسپر واحد
        reg_open_effective = registration_open_effective(comp)
        if not reg_open_effective:
            return Response(
                {"detail": "ثبت‌نام این مسابقه فعال نیست."},
                status=status.HTTP_400_BAD_REQUEST
            )

        player = UserProfile.objects.filter(user=request.user, role__in=["player", "both"]).first()
        if not player:
            return Response({"detail": "پروفایل بازیکن یافت نشد."}, status=status.HTTP_404_NOT_FOUND)

        # جلوگیری از ثبت‌نام تکراری (غیر از canceled)
        existing_qs = (
            Enrollment.objects
            .filter(competition=comp, player=player)
            .exclude(status="canceled")
        )
        if existing_qs.exists():
            exist = existing_qs.order_by("-id").first()
            return Response(
                {
                    "detail": "شما قبلاً برای این مسابقه ثبت‌نام کرده‌اید.",
                    "enrollment_id": exist.id,
                    "status": exist.status
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        payload = {
            "coach_code": (request.data.get("coach_code") or "").strip(),
            "declared_weight": (request.data.get("declared_weight") or "").strip(),
            "insurance_number": (request.data.get("insurance_number") or "").strip(),
            "insurance_issue_date": (request.data.get("insurance_issue_date") or "").strip(),
        }

        ser = CompetitionRegistrationSerializer(
            data=payload,
            context={"request": request, "competition": comp}
        )
        ser.is_valid(raise_exception=True)
        enrollment = ser.save()

        simulate_paid = (not getattr(settings, "PAYMENTS_ENABLED", False)) or (comp.entry_fee == 0)
        if simulate_paid:
            out = CompetitionRegistrationSerializer(enrollment, context={"request": request}).data
            return Response(
                {
                    "detail": "ثبت‌نام انجام شد و پرداخت آزمایشی موفق بود.",
                    "data": out,
                    "enrollment_id": enrollment.id,
                    "status": enrollment.status
                },
                status=status.HTTP_201_CREATED
            )

        return Response(
            {
                "detail": "ثبت‌نام ایجاد شد؛ نیاز به پرداخت واقعی دارید.",
                "enrollment_id": enrollment.id,
                "amount": comp.entry_fee or 0,
                "payment_required": True
            },
            status=status.HTTP_201_CREATED
        )


# ---------- وضعیت/تأیید مربی ----------
class CoachApprovalStatusView(views.APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [permissions.IsAuthenticated, IsCoach]

    def get(self, request, key):
        comp = _get_comp_by_key_any(key)
        coach = UserProfile.objects.filter(user=request.user, role__in=["coach", "both"]).first()
        if not coach:
            return Response({"detail": "پروفایل مربی یافت نشد."}, status=404)

        approval = None
        if isinstance(comp, PoomsaeCompetition):
            approval = None
        else:
            try:
                approval = CoachApproval.objects.filter(competition=comp, coach=coach).first()
            except (ValueError, ValidationError):
                approval = None

        coach_name = f"{coach.first_name} {coach.last_name}".strip()
        club_names = []
        if getattr(coach, "club", None) and getattr(coach.club, "club_name", None):
            club_names.append(coach.club.club_name)
        if hasattr(TkdClub, "coaches"):
            club_names += list(TkdClub.objects.filter(coaches=coach).values_list("club_name", flat=True))
        if isinstance(getattr(coach, "club_names", None), list):
            club_names += [c for c in coach.club_names if c]
        club_names = _uniq_preserve(club_names)

        approved = bool(approval and approval.is_active and (approval.terms_accepted or getattr(approval, "approved", False)))
        return Response({
            "competition": {"public_id": getattr(comp, "public_id", None), "title": getattr(comp, "title", None) or getattr(comp, "name", None)},
            "approved": approved,
            "terms_accepted": bool(approval and approval.terms_accepted),
            "is_active": bool(approval and approval.is_active),
            "code": approval.code if (approval and approval.is_active) else None,
            "coach_name": coach_name,
            "club_names": club_names,
        }, status=200)

# ---------- تأیید مسابقه و دریافت/تولید کد ----------
class ApproveCompetitionView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsCoach]

    @transaction.atomic
    def post(self, request, key):
        comp = _get_comp_by_key_any(key)
        if isinstance(comp, PoomsaeCompetition):
            return Response({"detail": "تأیید مربی برای پومسه هنوز به مدل جدا/جنریک وصل نشده است."}, status=400)

        coach = UserProfile.objects.filter(user=request.user, role__in=["coach", "both"]).first()
        if not coach:
            return Response({"detail": "پروفایل مربی یافت نشد."}, status=404)

        approval, _ = CoachApproval.objects.select_for_update().get_or_create(
            competition=comp, coach=coach,
            defaults={"terms_accepted": True, "is_active": True, "approved_at": timezone.now()}
        )
        changed = []
        if not approval.terms_accepted: approval.terms_accepted = True; changed.append("terms_accepted")
        if hasattr(approval, "approved") and not getattr(approval, "approved"): approval.approved = True; changed.append("approved")
        if not approval.is_active: approval.is_active = True; changed.append("is_active")
        if not approval.approved_at: approval.approved_at = timezone.now(); changed.append("approved_at")
        if changed: approval.save(update_fields=changed)

        if not approval.code:
            approval.set_fresh_code(save=True, force=True)

        return Response({"ok": True, "code": approval.code}, status=200)

# ---------- تعهدنامه ----------
class CompetitionTermsView(views.APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = [JWTAuthentication]

    def get(self, request, key):
        comp = _get_comp_by_key_any(key)
        title = getattr(getattr(comp, "terms_template", None), "title", "") or "تعهدنامه مربی"
        content = getattr(getattr(comp, "terms_template", None), "content", "") or "با ثبت تأیید، مسئولیت‌های مربی را می‌پذیرم."
        return Response({"title": title, "content": content}, status=status.HTTP_200_OK)

# ---------- لیست مسابقات قابل ثبت‌نام برای بازیکن ----------
class PlayerCompetitionsList(views.APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [permissions.IsAuthenticated, IsPlayer]

    def get(self, request):
        player = UserProfile.objects.filter(user=request.user, role__in=["player", "both"]).first()
        if not player or not player.coach:
            return Response([], status=200)

        base = KyorugiCompetition.objects.filter(
            coach_approvals__coach=player.coach,
            coach_approvals__is_active=True,
            coach_approvals__terms_accepted=True,
        ).distinct()

        qs = _opened(base, only_open=True)
        out = [{"public_id": c.public_id, "title": c.title, "style": "kyorugi"} for c in qs]
        return Response(out, status=200)

# ---------- لیست مسابقات برای داور ----------
class RefereeCompetitionsList(views.APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        referee = UserProfile.objects.filter(user=request.user, role='referee').first()
        if not referee:
            return Response([], status=200)

        qs = _opened(KyorugiCompetition.objects.all(), only_open=True)
        return Response([{"public_id": c.public_id, "title": c.title} for c in qs], status=200)

class DashboardAllCompetitionsView(views.APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        role, profile = _detect_role_and_profile(request)
        only_open = str(request.query_params.get("only_open", "")).lower() in {"1", "true", "yes"}

        ky_qs, po_qs = _dashboard_base_qs(role, profile, only_open)
        items = _order_items([*ky_qs, *po_qs])
        ser = DashboardAnyCompetitionSerializer(items, many=True, context={"request": request})
        return Response(ser.data, status=status.HTTP_200_OK)

class DashboardKyorugiListView(views.APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        role, profile = _detect_role_and_profile(request)
        only_open = str(request.query_params.get("only_open", "")).lower() in {"1","true","yes"}

        ky_qs, _ = _dashboard_base_qs(role, profile, only_open)
        items = _order_items(list(ky_qs))

        ser = DashboardAnyCompetitionSerializer(items, many=True, context={"request": request})
        return Response(ser.data, status=status.HTTP_200_OK)

# ---------- پیش‌پر کردن فرم ثبت‌نام خودی ----------
class RegisterSelfPrefillView(views.APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, key):
        comp = _get_comp_by_key(key)
        prof = UserProfile.objects.filter(user=request.user).first()
        if not prof:
            return Response(
                {"can_register": False, "detail": "پروفایل کاربر یافت نشد."},
                status=status.HTTP_404_NOT_FOUND,
            )

        def _strip_phone(s: str) -> str:
            if not s:
                return ""
            t = str(s)
            t = re.sub(r"[\u200e\u200f\u202a-\u202e\u2066-\u2069\u200c]", "", t)
            trans = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
            t_norm = t.translate(trans)
            t_norm = re.sub(r"[\s\-–—:|،]*[+(\[]?\d[\d\s\-\(\)]{6,}$", "", t_norm).strip()
            return t_norm if len(t_norm) < len(t) else t.strip()

        def _coach_name_only(p: UserProfile) -> str:
            if getattr(p, "coach", None):
                fn = getattr(p.coach, "first_name", "") or ""
                ln = getattr(p.coach, "last_name", "") or ""
                return f"{fn} {ln}".strip()
            return _strip_phone(getattr(p, "coach_name", "") or "")

        def _belt_display(p: UserProfile) -> str:
            if getattr(p, "belt_grade", None):
                return str(p.belt_grade)
            b = getattr(p, "belt", None)
            if b:
                for attr in ("name", "label", "title"):
                    v = getattr(b, attr, None)
                    if v:
                        return str(v)
                if isinstance(b, str):
                    return b
            for name in ("belt_name", "belt_label", "belt_title"):
                v = getattr(p, name, None)
                if v:
                    return str(v)
            return ""

        def _parse_birthdate_to_date(val):
            if not val:
                return None
            t = str(val).strip()
            if "T" in t:
                t = t[:10]
            t = t.replace("-", "/")
            t = t.translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789"))
            m = re.search(r"(\d{4})/(\d{1,2})/(\d{1,2})", t)
            if not m:
                return None
            y, m_, d = map(int, m.groups())
            try:
                if y < 1700:
                    g = jdatetime.date(y, m_, d).togregorian()
                    return _date(g.year, g.month, g.day)
                return _date(y, m_, d)
            except Exception:
                return None

        def _birth_display(p: UserProfile) -> str:
            raw = getattr(p, "birth_date", None) or getattr(p, "birthDate", None)
            if not raw:
                return ""
            g = _parse_birthdate_to_date(raw)
            if g:
                return jdatetime.date.fromgregorian(date=g).strftime("%Y/%m/%d")
            return ""

        # منطق باز بودن ثبت‌نام (هلسپر واحد)
        can_register = registration_open_effective(comp)

        coach_name = _coach_name_only(prof)

        club_name = ""
        if getattr(prof, "club", None):
            club_name = getattr(prof.club, "club_name", "") or getattr(prof.club, "name", "") or ""
        elif isinstance(getattr(prof, "club_names", None), list) and prof.club_names:
            club_name = "، ".join([c for c in prof.club_names if c])

        national = (
            getattr(prof, "national_code", "")
            or getattr(prof, "melli_code", "")
            or getattr(prof, "code_melli", "")
            or getattr(prof, "national_id", "")
        )

        birth_text = _birth_display(prof)
        belt_text = _belt_display(prof)

        data = {
            "competition": {
                "public_id": comp.public_id,
                "title": comp.title,
                "registration_open_effective": bool(can_register),
            },
            "can_register": bool(can_register),
            "locked": {
                "first_name": prof.first_name or getattr(request.user, "first_name", ""),
                "last_name":  prof.last_name  or getattr(request.user, "last_name",  ""),
                "national_code": national,
                "national_id":   national,
                "birth_date":    birth_text,
                "belt":          belt_text,
                "club":          club_name,
                "coach":         coach_name,

                "firstName":  prof.first_name or getattr(request.user, "first_name", ""),
                "lastName":   prof.last_name  or getattr(request.user, "last_name",  ""),
                "nationalCode": national,
                "nationalId":   national,
                "birthDate":    birth_text,
                "beltName":     belt_text,
                "coachName":    coach_name,
            },
            "suggested": {
                "weight": getattr(prof, "weight", None),
                "insurance_number": getattr(prof, "insurance_number", "") or "",
                "insurance_issue_date": getattr(prof, "insurance_issue_date", "") or "",
            },
            "need_coach_code": str(getattr(prof, "role", "")).lower() in ["player", "both"],
        }
        return Response(data, status=status.HTTP_200_OK)

class EnrollmentCardView(views.APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, enrollment_id: int):
        enrollment = get_object_or_404(Enrollment, id=enrollment_id)

        user = request.user
        allowed = False

        if getattr(enrollment.player, "user_id", None) == user.id:
            allowed = True
        else:
            prof = UserProfile.objects.filter(user=user).first()

            if (
                prof and (
                    str(getattr(prof, "role", "")).lower() in {"coach", "both"} or getattr(prof, "is_coach", False)
                )
                and enrollment.coach_id == prof.id
            ):
                allowed = True

            if not allowed:
                club = TkdClub.objects.filter(user=user).first()
                if club and enrollment.club_id == club.id:
                    allowed = True

            if not allowed:
                board = TkdBoard.objects.filter(user=user).first()
                if board and enrollment.board_id == board.id:
                    allowed = True

        if not allowed:
            return Response({"detail": "اجازه دسترسی ندارید."}, status=status.HTTP_403_FORBIDDEN)

        if enrollment.status not in CARD_READY_STATUSES:
            return Response({"detail": "هنوز پرداخت/تأیید نهایی نشده است."},
                            status=status.HTTP_403_FORBIDDEN)

        ser = EnrollmentCardSerializer(enrollment, context={"request": request})
        return Response(ser.data, status=status.HTTP_200_OK)

class MyEnrollmentView(views.APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, key):
        comp = _get_comp_by_key(key)

        player = UserProfile.objects.filter(user=request.user, role__in=["player", "both"]).first()
        if not player:
            return Response({"enrollment_id": None}, status=status.HTTP_200_OK)

        qs = Enrollment.objects.filter(competition=comp, player=player)

        model_field_names = {f.name for f in Enrollment._meta.get_fields()}
        sr = []
        if "division" in model_field_names:
            sr.append("division")
        if "division_weight" in model_field_names:
            sr.append("division_weight")
        if "weight_category" in model_field_names:
            sr.append("weight_category")
        if "belt_group" in model_field_names:
            sr.append("belt_group")
        if sr:
            qs = qs.select_related(*sr)

        e = qs.first()
        if not e:
            return Response({"enrollment_id": None}, status=status.HTTP_200_OK)

        can_show_card = e.status in CARD_READY_STATUSES
        return Response({"enrollment_id": e.id, "status": e.status, "can_show_card": can_show_card},
                        status=status.HTTP_200_OK)

class KyorugiBracketView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, key):
        comp = _get_comp_by_key(key)

        has_any_draw = comp.draws.exists()
        has_unnumbered_real_matches = Match.objects.filter(
            draw__competition=comp, is_bye=False, match_number__isnull=True
        ).exists()
        bracket_ready = has_any_draw and not has_unnumbered_real_matches

        if not bracket_ready:
            return Response({"detail": "bracket_not_ready"}, status=status.HTTP_404_NOT_FOUND)

        ser = KyorugiBracketSerializer(comp, context={"request": request})
        return Response(ser.data, status=status.HTTP_200_OK)

# ───────── GET: لیست شاگردها با پیش‌تیک ثبت‌نام‌شده‌ها ─────────
class CoachStudentsEligibleListView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [permissions.IsAuthenticated, IsCoach]

    def get(self, request, key):
        comp = _get_comp_by_key(key)
        coach = _coach_from_request(request)
        if not coach:
            return Response({"detail": "پروفایل مربی یافت نشد."}, status=status.HTTP_404_NOT_FOUND)

        allowed_belts = _allowed_belt_names_for_comp(comp)
        req_gender = _required_gender_for_comp(comp)

        students_qs = (
            UserProfile.objects
            .filter(coach=coach, role__in=["player", "both"])
            .select_related("club", "tkd_board")
            .only(
                "id","first_name","last_name","national_code","birth_date",
                "belt_grade","gender","club","tkd_board"
            )
        )
        if req_gender in ("male","female"):
            students_qs = students_qs.filter(gender=req_gender)

        ids = list(students_qs.values_list("id", flat=True))
        existing_map = dict(
            Enrollment.objects
            .filter(competition=comp, player_id__in=ids)
            .exclude(status="canceled")
            .values_list("player_id", "status")
        )

        items = []
        for s in students_qs:
            if s.belt_grade not in allowed_belts:
                continue
            if not _age_ok_for_comp(s, comp):
                continue
            items.append({
                "id": s.id,
                "first_name": s.first_name,
                "last_name": s.last_name,
                "national_code": s.national_code,
                "birth_date": s.birth_date,
                "belt_grade": s.belt_grade,
                "belt": s.belt_grade,
                "club_name": getattr(s.club, "club_name", "") if s.club_id else "",
                "board_name": getattr(s.tkd_board, "name", "") if s.tkd_board_id else "",
                "already_enrolled": s.id in existing_map,
                "enrollment_status": existing_map.get(s.id),
            })

        belt_groups = list(comp.belt_groups.values_list("label", flat=True))

        return Response({
            "competition": {
                "public_id": comp.public_id,
                "title": comp.title,
                "entry_fee": comp.entry_fee,
                "gender": comp.gender,
                "gender_display": comp.get_gender_display(),
                "age_category_name": getattr(comp.age_category, "name", None),
                "belt_groups_display": "، ".join([b for b in belt_groups if b]),
            },
            "students": items,
            "prechecked_ids": list(existing_map.keys()),
        }, status=status.HTTP_200_OK)

# ───────── POST: ثبت‌نام گروهی ─────────
class CoachRegisterStudentsView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [permissions.IsAuthenticated, IsCoach]

    @transaction.atomic
    def post(self, request, key):
        comp = _get_comp_by_key(key)
        coach = _coach_from_request(request)
        if not coach:
            return Response({"detail": "پروفایل مربی یافت نشد."}, status=404)

        items = request.data.get("students") or []
        if not isinstance(items, list) or not items:
            return Response({"detail": "لیست شاگردان خالی است."}, status=400)

        player_ids = [int(i.get("player_id")) for i in items if i.get("player_id")]
        already = set(
            Enrollment.objects.filter(competition=comp, player_id__in=player_ids)
            .exclude(status="canceled")
            .values_list("player_id", flat=True)
        )

        created_ids, skipped_already, errors = [], [], {}
        allowed_weight_ids = comp.allowed_weight_ids()
        req_gender = _required_gender_for_comp(comp)

        for it in items:
            pid = it.get("player_id")
            if not pid:
                continue
            pid = int(pid)

            if pid in already:
                skipped_already.append(pid); continue

            player = UserProfile.objects.filter(id=pid, role__in=["player", "both"]).first()
            if not player:
                errors[str(pid)] = "پروفایل بازیکن یافت نشد."; continue

            if req_gender in ("male","female") and _gender_norm(player.gender) != req_gender:
                errors[str(pid)] = "جنسیت بازیکن با مسابقه سازگار نیست."; continue

            raw_ins = (it.get("insurance_issue_date") or "").replace("-", "/")
            try:
                y, m, d = [int(x) for x in raw_ins.split("/")[:3]]
                ins_date = jdatetime.date(y, m, d).togregorian() if y < 1700 else _date(y, m, d)
            except Exception:
                errors[str(pid)] = "تاریخ صدور بیمه نامعتبر است."; continue
            if comp.competition_date and ins_date > (comp.competition_date - timedelta(days=3)):
                errors[str(pid)] = "تاریخ صدور بیمه باید حداقل ۷۲ ساعت قبل از مسابقه باشد."; continue

            try:
                declared_weight = float(str(it.get("declared_weight")).replace(",", "."))
            except Exception:
                declared_weight = 0.0
            if declared_weight <= 0:
                errors[str(pid)] = "وزن اعلامی نامعتبر است."; continue

            belt_group = comp.belt_groups.filter(belts__name=player.belt_grade).first() if comp.belt_groups.exists() else None

            weight_cat = None
            if allowed_weight_ids:
                gender_for_wc = req_gender or _gender_norm(player.gender)
                weight_cat = WeightCategory.objects.filter(
                    id__in=allowed_weight_ids,
                    gender=gender_for_wc,
                    min_weight__lte=declared_weight,
                    max_weight__gte=declared_weight,
                ).order_by("min_weight").first()

            # نام هیأت/هیأت استان ایمن‌تر
            board_obj = getattr(player, "tkd_board", None)
            board_name = getattr(board_obj, "name", "") if board_obj else ""

            e = Enrollment.objects.create(
                competition=comp,
                player=player,
                coach=coach,
                coach_name=f"{coach.first_name} {coach.last_name}".strip(),
                club=getattr(player, "club", None),
                club_name=getattr(player.club, "club_name", "") if getattr(player, "club", None) else "",
                board=board_obj,
                board_name=board_name,
                belt_group=belt_group,
                weight_category=weight_cat,
                declared_weight=declared_weight,
                insurance_number=str(it.get("insurance_number") or ""),
                insurance_issue_date=ins_date,
                status="pending_payment",
                is_paid=False,
                paid_amount=0,
            )
            created_ids.append(e.id)

        total_amount = (comp.entry_fee or 0) * len(created_ids)
        simulate_paid = (not getattr(settings, "PAYMENTS_ENABLED", False)) or (comp.entry_fee == 0)
        if simulate_paid and created_ids:
            enrollments_out = []
            for eid in created_ids:
                e = Enrollment.objects.get(id=eid)
                e.mark_paid(amount=comp.entry_fee or 0, ref_code=f"TEST-COACH-{e.id:06d}")
                enrollments_out.append({
                    "enrollment_id": e.id,
                    "status": e.status,
                    "player": {"id": e.player_id, "name": f"{e.player.first_name} {e.player.last_name}"},
                })
            return Response({
                "detail": "ثبت‌نام انجام و پرداخت آزمایشی شد.",
                "amount": total_amount,
                "enrollment_ids": [x["enrollment_id"] for x in enrollments_out],
                "enrollments": enrollments_out,
                "skipped_already_enrolled": skipped_already,
                "errors": errors,
            }, status=status.HTTP_201_CREATED)

        return Response({
            "detail": "ثبت‌نام ایجاد شد. پرداخت لازم است.",
            "amount": total_amount,
            "enrollment_ids": created_ids,
            "created_ids": created_ids,
            "skipped_already_enrolled": skipped_already,
            "errors": errors,
        }, status=status.HTTP_201_CREATED if created_ids else status.HTTP_200_OK)

class EnrollmentCardsBulkView(views.APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        ids = request.data.get("ids") or request.data.get("enrollment_ids") or []
        if not isinstance(ids, (list, tuple)):
            return Response({"detail": "ids باید آرایه باشد."}, status=status.HTTP_400_BAD_REQUEST)

        ids = [int(i) for i in ids if str(i).isdigit()]

        prof  = UserProfile.objects.filter(user=request.user).first()
        club  = TkdClub.objects.filter(user=request.user).first()
        board = TkdBoard.objects.filter(user=request.user).first()

        out = []
        for e in Enrollment.objects.filter(id__in=ids):
            allowed = (
                getattr(e.player, "user_id", None) == request.user.id
                or (prof and (
                    str(getattr(prof, "role", "")).lower() in {"coach", "both"} or getattr(prof, "is_coach", False)
            ) and e.coach_id == prof.id)
                or (club and e.club_id == club.id)
                or (board and e.board_id == board.id)
            )
            if not allowed:
                out.append({"enrollment_id": e.id, "error": "forbidden"})
                continue
            if e.status not in CARD_READY_STATUSES:
                out.append({"enrollment_id": e.id, "error": "not_ready"})
                continue
            data = EnrollmentCardSerializer(e, context={"request": request}).data
            data["enrollment_id"] = e.id
            out.append(data)

        out_sorted = []
        by_id = {item.get("enrollment_id"): item for item in out}
        for i in ids:
            if i in by_id:
                out_sorted.append(by_id[i])

        return Response(out_sorted, status=status.HTTP_200_OK)

# ------------------------------ نتایج کیوروگی ------------------------------
class KyorugiResultsView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, key):
        comp = _get_comp_by_key(key)
        qs = (
            KyorugiResult.objects
            .filter(competition=comp)
            .select_related(
                "weight_category",
                "gold_enrollment__player", "gold_enrollment__club",
                "silver_enrollment__player", "silver_enrollment__club",
                "bronze1_enrollment__player", "bronze2_enrollment__player",
                "bronze1_enrollment__club",  "bronze2_enrollment__club",
            )
            .order_by("weight_category__gender", "weight_category__min_weight", "weight_category__name")
        )

        out = []
        for r in qs:
            out.append({
                "weight": getattr(r.weight_category, "name", None) or "—",
                "gold":   _enr_label(getattr(r, "gold_enrollment", None)),
                "silver": _enr_label(getattr(r, "silver_enrollment", None)),
                "bronze1": _enr_label(getattr(r, "bronze1_enrollment", None)),
                "bronze2": _enr_label(getattr(r, "bronze2_enrollment", None)),
            })
        return Response({"results": out, "count": len(out)}, status=status.HTTP_200_OK)

# ------------------------------------------------------------- سمینار -------------------------------------------------------------
class DefaultPagination(PageNumberPagination):
    page_size = 12
    page_size_query_param = "page_size"
    max_page_size = 100

class SeminarListView(generics.ListAPIView):
    serializer_class = SeminarSerializer
    permission_classes = [permissions.AllowAny]
    pagination_class = DefaultPagination

    def get_queryset(self):
        qs = Seminar.objects.all()

        q = (self.request.query_params.get("q") or "").strip()
        if q:
            qs = qs.filter(
                Q(title__icontains=q) |
                Q(description__icontains=q) |
                Q(location__icontains=q)
            )

        role = (self.request.query_params.get("role") or "").strip().lower()
        if role and role not in ("club", "heyat"):
            if role == "both":
                wanted = {"coach", "referee"}
                ids = [
                    s.id for s in qs.only("id", "allowed_roles")
                    if not (s.allowed_roles or []) or (wanted & set(s.allowed_roles or []))
                ]
            else:
                ids = [
                    s.id for s in qs.only("id", "allowed_roles")
                    if not (s.allowed_roles or []) or (role in (s.allowed_roles or []))
                ]
            qs = qs.filter(id__in=ids)

        date_from = (self.request.query_params.get("date_from") or "").strip()
        date_to   = (self.request.query_params.get("date_to") or "").strip()
        if date_from:
            qs = qs.filter(event_date__gte=date_from)
        if date_to:
            qs = qs.filter(event_date__lte=date_to)

        open_only = self.request.query_params.get("open")
        if open_only in ("1", "true", "True"):
            today = timezone.localdate()
            qs = qs.filter(registration_start__lte=today, registration_end__gte=today)

        upcoming = self.request.query_params.get("upcoming")
        past     = self.request.query_params.get("past")
        today = timezone.localdate()
        if upcoming in ("1", "true", "True"):
            qs = qs.filter(event_date__gte=today)
        if past in ("1", "true", "True"):
            qs = qs.filter(event_date__lt=today)

        ordering = self.request.query_params.get("ordering") or "event_date"
        allowed = {"event_date", "-event_date", "created_at", "-created_at", "title", "-title"}
        if ordering not in allowed:
            ordering = "event_date"
        return qs.order_by(ordering, "id")

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["request"] = self.request
        return ctx

class SeminarDetailView(generics.RetrieveAPIView):
    queryset = Seminar.objects.all()
    serializer_class = SeminarSerializer
    lookup_field = "public_id"
    lookup_url_kwarg = "key"
    permission_classes = [permissions.AllowAny]

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["request"] = self.request
        return ctx

class SeminarRegisterView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, key):
        seminar = get_object_or_404(Seminar, public_id=key)
        roles = request.data.get("roles") or []

        allowed = seminar.allowed_roles or []
        if allowed and not any(r in allowed for r in roles):
            return Response({"detail": "نقش شما مجاز به ثبت‌نام نیست."}, status=400)

        try:
            with transaction.atomic():
                reg, created = SeminarRegistration.objects.get_or_create(
                    seminar=seminar, user=request.user,
                    defaults={"roles": roles or [], "is_paid": False, "paid_amount": 0, "paid_at": None}
                )
        except IntegrityError:
            reg = SeminarRegistration.objects.filter(seminar=seminar, user=request.user).first()
            created = False

        return Response({
            "status": "ok",
            "created": bool(created),
            "registration_id": getattr(reg, "id", None),
            "payment_required": False,
        }, status=200)

class MySeminarRegistrationsView(generics.ListAPIView):
    serializer_class = SeminarRegistrationSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = DefaultPagination

    def get_queryset(self):
        qs = SeminarRegistration.objects.select_related("seminar").filter(user=self.request.user)

        paid = self.request.query_params.get("paid")
        if paid in ("1", "true", "True"):
            qs = qs.filter(is_paid=True)
        elif paid in ("0", "false", "False"):
            qs = qs.filter(is_paid=False)

        q = (self.request.query_params.get("q") or "").strip()
        if q:
            qs = qs.filter(
                Q(seminar__title__icontains=q) |
                Q(seminar__location__icontains=q)
            )

        return qs.order_by("-created_at", "-id")

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["request"] = self.request
        return ctx

ROLE_ALL = {"player", "coach", "referee"}

@api_view(["GET"])
@permission_classes([AllowAny])
def sidebar_seminars(request):
    role  = (request.query_params.get("role") or "player").lower()
    limit = int(request.query_params.get("limit", 6))
    show  = request.query_params.get("show", "upcoming")

    today = timezone.localdate()
    qs = Seminar.objects.all()

    if show == "open":
        qs = qs.filter(registration_start__lte=today, registration_end__gte=today).order_by("event_date", "-created_at")
    elif show == "upcoming":
        qs = qs.filter(event_date__gte=today).order_by("event_date", "-created_at")
    elif show == "past":
        qs = qs.filter(event_date__lt=today).order_by("-event_date", "-created_at")
    else:
        qs = qs.order_by("event_date", "-created_at")

    if role not in ("club", "heyat"):
        superset = list(qs[:200])

        def role_ok(s):
            allowed = (s.allowed_roles or [])
            if not allowed:
                return True
            if role == "both":
                return ("coach" in allowed) or ("referee" in allowed)
            return role in allowed

        filtered = [s for s in superset if role_ok(s)]
        qs = filtered[:limit]
        data = SeminarCardSerializer(qs, many=True, context={"request": request}).data
        return Response(data)

    qs = qs[:limit]
    data = SeminarCardSerializer(qs, many=True, context={"request": request}).data
    return Response(data)

# =============================== Poomsae specific ===============================
class PoomsaeCoachApprovalStatusView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsCoach]

    def get(self, request, public_id):
        comp = get_object_or_404(PoomsaeCompetition, public_id=public_id)

        coach = UserProfile.objects.filter(user=request.user, role__in=["coach", "both"]).first()
        if not coach:
            return Response({"detail": "پروفایل مربی یافت نشد."}, status=404)

        appr = PoomsaeCoachApproval.objects.filter(competition=comp, coach=coach, is_active=True).first()

        coach_name = f"{coach.first_name} {coach.last_name}".strip()
        club_names = []
        if getattr(coach, "club", None) and getattr(coach.club, "club_name", None):
            club_names.append(coach.club.club_name)
        if hasattr(TkdClub, "coaches"):
            club_names += list(TkdClub.objects.filter(coaches=coach).values_list("club_name", flat=True))
        if isinstance(getattr(coach, "club_names", None), list):
            club_names += [c for c in coach.club_names if c]
        club_names = _uniq_preserve(club_names)

        return Response({
            "competition": {"public_id": comp.public_id, "title": comp.name},
            "approved": bool(appr and appr.approved and appr.is_active),
            "is_active": bool(appr and appr.is_active),
            "code": appr.code if appr and appr.is_active else None,
            "coach_name": coach_name,
            "club_names": club_names,
        }, status=200)

class PoomsaeCoachApprovalApproveView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsCoach]

    @transaction.atomic
    def post(self, request, public_id):
        comp = get_object_or_404(PoomsaeCompetition, public_id=public_id)

        coach = UserProfile.objects.filter(user=request.user, role__in=["coach", "both"]).first()
        if not coach:
            return Response({"detail": "پروفایل مربی یافت نشد."}, status=404)

        # باز بودن ثبت‌نام با هلسپر واحد
        if not registration_open_effective(comp):
            return Response({"detail": "ثبت‌نام این مسابقه فعال نیست."}, status=400)

        # ایجاد یا به‌روزرسانی تأیید
        appr, _ = PoomsaeCoachApproval.objects.select_for_update().get_or_create(
            competition=comp, coach=coach,
            defaults={"approved": True, "is_active": True}
        )

        changed = []
        if not appr.approved:
            appr.approved = True
            changed.append("approved")
        if not appr.is_active:
            appr.is_active = True
            changed.append("is_active")
        if changed:
            appr.save(update_fields=changed)

        if not appr.code:
            appr.set_fresh_code(save=True, force=True)

        return Response({"ok": True, "code": appr.code}, status=200)

class PoomsaeCompetitionDetailView(views.APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [permissions.AllowAny]

    def get(self, request, key):
        base_qs = (
            PoomsaeCompetition.objects
            .select_related("age_category")
            .prefetch_related("images", "files")
        )

        s = str(key).strip()
        if s.isdigit():
            comp = get_object_or_404(base_qs, id=int(s))
        else:
            comp = base_qs.filter(public_id__iexact=s).first() or base_qs.filter(slug__iexact=s).first()
            if not comp:
                raise Http404("PoomsaeCompetition not found")

        reg_open_effective = registration_open_effective(comp)

        ser = PoomsaeCompetitionDetailSerializer(comp, context={"request": request})
        data = dict(ser.data)
        data["kind"] = "poomsae"
        data["registration_open_effective"] = bool(reg_open_effective)
        data["can_register"] = bool(reg_open_effective)

        _age_txt = _age_groups_display_for(comp)
        _note = "ثبت‌نام تیم پومسه بر عهده مربی می‌باشد"

        data.update({
            "age_groups_display": _age_txt,
            "ageGroupsDisplay": _age_txt,
            "age_category_name": _age_txt,  # سازگاری با نسخه‌های قدیمی
            "team_registration_by": "coach",
            "teamRegistrationBy": "coach",
            "team_registration_note": _note,
            "teamRegistrationNote": _note,
        })

        if request.user and request.user.is_authenticated:
            coach = UserProfile.objects.filter(user=request.user, role__in=["coach", "both"]).first()
            if coach:
                appr = PoomsaeCoachApproval.objects.filter(
                    competition=comp, coach=coach, is_active=True
                ).first()
                data["my_coach_approval"] = {
                    "approved": bool(appr and appr.approved),
                    "code": appr.code if appr and appr.is_active else None,
                }

            player = UserProfile.objects.filter(user=request.user, role__in=["player", "both"]).only("gender", "belt_grade").first()
            if player:
                belt_val = getattr(player, "belt_grade", "") or getattr(player, "belt_name", "") or ""
                data["my_profile"] = {"gender": player.gender, "belt": belt_val}

            data["registration_open"] = bool(reg_open_effective)
            data["user_eligible_self"] = _poomsae_user_eligible(request.user, comp)

        return Response(data, status=status.HTTP_200_OK)

# Mixin (ریزاصلاح: به‌جای raise، return می‌کنیم)
class CompetitionLookupMixin:
    model = None
    def get_competition_by_key(self, key):
        qs = self.model.objects.all()
        if str(key).isdigit():
            return get_object_or_404(qs, id=int(key))
        obj = qs.filter(public_id__iexact=key).first()
        if obj:
            return obj
        obj = qs.filter(slug__iexact=key).first()
        if obj:
            return obj
        return get_object_or_404(qs, public_id__iexact=key)



@api_view(["POST"])
@permission_classes([IsAuthenticated])
def poomsae_register_self(request, public_id):
    comp = get_object_or_404(PoomsaeCompetition, public_id=public_id)
    ser = PoomsaeRegistrationSerializer(data=request.data, context={"request": request, "competition": comp})
    ser.is_valid(raise_exception=True)
    enrollment = ser.save()
    return Response(ser.to_representation(enrollment), status=status.HTTP_201_CREATED)
