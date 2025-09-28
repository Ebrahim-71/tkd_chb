# --- stdlib
import logging
import re
from collections import defaultdict
from datetime import date, datetime, timedelta
date_cls = date
dt_cls = datetime

# --- third-party
import jdatetime

# --- Django / DRF
from django.apps import apps
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction, IntegrityError
from django.db.models import Q, Exists, OuterRef, ForeignKey, OneToOneField
from django.db.utils import OperationalError, ProgrammingError
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.timezone import now
# بالا: imports
from datetime import date as _d, datetime as _dt




from rest_framework import views, viewsets, generics, permissions, status
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
    PoomsaeCompetition, PoomsaeCoachApproval, PoomsaeEntry, PoomsaeDivision,
)

# --- Project permissions
from .permissions import IsCoach, IsPlayer

# --- Project serializers / utils
from .serializers import (
    # Kyorugi
    KyorugiCompetitionDetailSerializer,
    CompetitionRegistrationSerializer,
    DashboardKyorugiCompetitionSerializer,
    EnrollmentCardSerializer,
    KyorugiBracketSerializer,
    EnrollmentLiteSerializer,
    # Common normalizers
    _norm_belt, _player_belt_code_from_profile, _norm_gender,
    # Seminars
    SeminarSerializer, SeminarRegistrationSerializer, SeminarCardSerializer,
    # Poomsae
    PoomsaeCompetitionDetailSerializer, DashboardPoomsaeCompetitionSerializer,
)

POOMSAE_ENABLED = True
POOMSAE_SERIALIZER_ENABLED = True

# وضعیت‌هایی که کارت آماده نمایش است
CARD_READY_STATUSES = {"paid", "confirmed", "approved", "accepted", "completed"}

def _poomsae_user_eligible(comp, user):
    if not user or not getattr(user, "is_authenticated", False):
        return None
    prof = (UserProfile.objects.filter(user=user, role__in=["player", "both"]).first()
            or UserProfile.objects.filter(user=user).first())
    if not prof:
        return False

    # فقط male/female یا None
    rg = _required_gender_for_comp(comp)  # ← دیگه "both" نداریم
    pg = _norm_gender(getattr(prof, "gender", None))
    gender_ok = True if rg is None else (pg == rg)

    allowed = set()
    if getattr(comp, "belt_groups", None) and comp.belt_groups.exists():
        for g in comp.belt_groups.all().prefetch_related("belts"):
            for b in g.belts.all():
                nm = getattr(b, "name", "") or getattr(b, "label", "")
                code = _norm_belt(nm)
                if code:
                    allowed.add(code)

    player_belt_code = _player_belt_code_from_profile(prof)
    belt_ok = True if not allowed else (player_belt_code in allowed)
    return bool(gender_ok and belt_ok)


def _gender_norm(val):
    m = {
        "male":"male","m":"male","man":"male","boy":"male","مرد":"male","آقا":"male",
        "female":"female","f":"female","woman":"female","girl":"female","زن":"female","خانم":"female",
        "both":"both","mix":"both", "":None, None:None
    }
    return m.get(str(val).strip().lower(), None)

def _required_gender_for_comp(comp) -> str | None:
    g = _gender_norm(getattr(comp, "gender", None))
    return g if g in ("male", "female") else None


def _get_comp_any_by_key(key):
    s = str(key).strip()
    obj = KyorugiCompetition.objects.filter(public_id=s).first()
    if not obj and s.isdigit():
        obj = KyorugiCompetition.objects.filter(id=int(s)).first()
    if not obj and PoomsaeCompetition:
        obj = PoomsaeCompetition.objects.filter(public_id=s).first() or (
            PoomsaeCompetition.objects.filter(id=int(s)).first() if s.isdigit() else None
        )
    if not obj:
        raise Http404
    return obj


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


# ---------- helper: فقط public_id معتبر ----------
def _get_comp_by_key(key: str) -> KyorugiCompetition:
    s = str(key).strip()
    if s.isdigit():
        return get_object_or_404(KyorugiCompetition, id=int(s))
    return get_object_or_404(KyorugiCompetition, public_id=s)


# ---------- جزئیات مسابقه ----------
class KyorugiCompetitionDetailView(views.APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [permissions.AllowAny]  # عمومی، ولی اگر توکن باشد user ست می‌شود

    def get(self, request, key):
        comp = _get_comp_by_key(key)
        ser = KyorugiCompetitionDetailSerializer(comp, context={"request": request})
        data = dict(ser.data)

        # اگر کاربر وارد شده و بازیکن است، وضعیت ثبت‌نام خودش را هم ضمیمه بده
        if request.user and request.user.is_authenticated:
            player = UserProfile.objects.filter(user=request.user, role__in=["player", "both"]).first()
            if player:
                enr = Enrollment.objects.filter(competition=comp, player=player).order_by("-id").first()
                if enr:
                    data["my_enrollment"] = {"id": enr.id, "status": enr.status}
                    data["card_ready"] = enr.status in CARD_READY_STATUSES
                else:
                    data["my_enrollment"] = None
                    data["card_ready"] = False

        return Response(data, status=status.HTTP_200_OK)


# ---------- ثبت‌نام خودِ بازیکن ----------
class RegisterSelfView(views.APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [permissions.IsAuthenticated, IsPlayer]

    @transaction.atomic
    def post(self, request, key):
        # 1) مسابقه
        comp = _get_comp_by_key(key)

        # 2) پروفایل بازیکن
        player = UserProfile.objects.filter(user=request.user, role__in=["player", "both"]).first()
        if not player:
            return Response({"detail": "پروفایل بازیکن یافت نشد."}, status=status.HTTP_404_NOT_FOUND)

        # 3) جلوگیری از ثبت‌نام تکراری (لغوشده‌ها استثناء هستند)
        existing_qs = (
            Enrollment.objects
            .filter(competition=comp, player=player)
            .exclude(status="canceled")
        )
        if existing_qs.exists():
            exist = existing_qs.order_by("-id").first()
            return Response(
                {"detail": "شما قبلاً برای این مسابقه ثبت‌نام کرده‌اید.",
                 "enrollment_id": exist.id, "status": exist.status},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 4) داده‌های ورودی فرم
        payload = {
            "coach_code": (request.data.get("coach_code") or "").strip(),
            "declared_weight": (request.data.get("declared_weight") or "").strip(),
            "insurance_number": (request.data.get("insurance_number") or "").strip(),
            "insurance_issue_date": (request.data.get("insurance_issue_date") or "").strip(),  # شمسی YYYY/MM/DD
        }

        # 5) اعتبارسنجی/ساخت ثبت‌نام
        ser = CompetitionRegistrationSerializer(data=payload, context={"request": request, "competition": comp})
        ser.is_valid(raise_exception=True)
        enrollment = ser.save()  # Enrollment ساخته می‌شود

        # 6) پرداخت آزمایشی (یا رایگان)
        simulate_paid = (not getattr(settings, "PAYMENTS_ENABLED", False)) or (comp.entry_fee == 0)
        if simulate_paid:
            ref = f"TEST-{enrollment.id:06d}"
            enrollment.mark_paid(amount=comp.entry_fee or 0, ref_code=ref)
            out = CompetitionRegistrationSerializer(enrollment, context={"request": request}).data
            return Response(
                {"detail": "ثبت‌نام انجام شد و پرداخت آزمایشی موفق بود.",
                 "data": out, "enrollment_id": enrollment.id, "status": enrollment.status},
                status=status.HTTP_201_CREATED
            )

        # 7) مسیر واقعی پرداخت (وقتی درگاه داشتید)
        # intent = PaymentIntent.objects.create(...)
        # enrollment.payment_intent = intent
        # enrollment.save(update_fields=["payment_intent"])
        # return Response({
        #     "detail": "ثبت‌نام انجام شد. شما به درگاه پرداخت هدایت می‌شوید.",
        #     "data": {"enrollment_id": enrollment.id, "status": enrollment.status},
        #     "payment_url": intent.get_redirect_url(),
        # }, status=status.HTTP_201_CREATED)


# ---------- وضعیت/تأیید مربی ----------
class CoachApprovalStatusView(views.APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [permissions.IsAuthenticated, IsCoach]

    def get(self, request, key):
        # ⬅️ پشتیبانی از هر دو مدل مسابقه
        comp = _get_comp_any_by_key(key)

        coach = UserProfile.objects.filter(user=request.user, role__in=["coach", "both"]).first()
        if not coach:
            return Response({"detail": "پروفایل مربی یافت نشد."}, status=status.HTTP_404_NOT_FOUND)

        coach_name = f"{coach.first_name} {coach.last_name}".strip()

        club_names = set()
        if getattr(coach, "club", None) and getattr(coach.club, "club_name", None):
            club_names.add(coach.club.club_name)
        if hasattr(TkdClub, "coaches"):
            club_names.update(
                TkdClub.objects.filter(coaches=coach).values_list("club_name", flat=True)
            )
        if isinstance(getattr(coach, "club_names", None), list):
            club_names.update([c for c in coach.club_names if c])

        # ⬅️ مدل مناسب را بر اساس نوع مسابقه انتخاب کن
        ApprModel = PoomsaeCoachApproval if isinstance(comp, PoomsaeCompetition) else CoachApproval

        approval = ApprModel.objects.filter(competition=comp, coach=coach).first()
        return Response({
            "competition": {"public_id": comp.public_id, "title": comp.title},
            "approved": bool(approval and approval.terms_accepted and approval.is_active),
            "code": approval.code if approval and approval.is_active else None,
            "coach_name": coach_name,
            "club_names": [c for c in club_names if c],
            # (اختیاری) برای فرانت اگر بخواهی نوع را بدانی:
            "style": getattr(comp, "style_display", ""),
        }, status=status.HTTP_200_OK)

# ---------- تأیید مسابقه و دریافت/تولید کد ----------
class ApproveCompetitionView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsCoach]

    @transaction.atomic
    def post(self, request, key):
        comp = _get_comp_any_by_key(key)

        if not comp.registration_open:
            return Response({"detail": "ثبت‌نام این مسابقه فعال نیست."}, status=400)

        coach = UserProfile.objects.filter(user=request.user, role__in=["coach", "both"]).first()
        if not coach:
            return Response({"detail": "پروفایل مربی یافت نشد."}, status=404)

        ApprModel = PoomsaeCoachApproval if isinstance(comp, PoomsaeCompetition) else CoachApproval

        # قفل رکورد برای جلوگیری از شرایط رقابتی
        approval, _ = ApprModel.objects.select_for_update().get_or_create(
            competition=comp, coach=coach,
            defaults={"terms_accepted": True, "is_active": True, "approved_at": timezone.now()}
        )

        changed = []
        if not approval.terms_accepted:
            approval.terms_accepted = True; changed.append("terms_accepted")
        if not approval.is_active:
            approval.is_active = True;      changed.append("is_active")
        if not approval.approved_at:
            approval.approved_at = timezone.now(); changed.append("approved_at")
        if changed:
            approval.save(update_fields=changed)

        # کُد را حتماً بساز (یا نگه‌دار)
        if not approval.code:
            approval.set_fresh_code(save=True, force=True)

        # برای اطمینان از مقدار نهایی
        approval.refresh_from_db(fields=("code", "terms_accepted", "is_active", "approved_at"))

        return Response(
            {"code": approval.code, "terms_accepted": approval.terms_accepted, "approved_at": approval.approved_at},
            status=200
        )


# ---------- تعهدنامه مسابقه (نمایش متن قالب) ----------
class CompetitionTermsView(views.APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = [JWTAuthentication]

    def get(self, request, key):
        comp = _get_comp_any_by_key(key)  # ⬅️ به‌جای فقط کیوروگی
        title = getattr(getattr(comp, "terms_template", None), "title", "") or "تعهدنامه مربی"
        content = getattr(getattr(comp, "terms_template", None), "content", "") or "با ثبت تأیید، مسئولیت‌های مربی را می‌پذیرم."
        style = getattr(comp, "style_display", "")
        return Response({"title": title, "content": content, "style": style}, status=status.HTTP_200_OK)


# ---------- لیست مسابقات قابل ثبت‌نام برای بازیکن ----------
class PlayerCompetitionsList(views.APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [permissions.IsAuthenticated, IsPlayer]

    def get(self, request):
        player = UserProfile.objects.filter(user=request.user, role__in=["player", "both"]).first()
        if not player or not player.coach:
            return Response([], status=status.HTTP_200_OK)

        today = now().date()

        # کیوروگی: مثل قبل
        ky_qs = (
            KyorugiCompetition.objects
            .filter(
                registration_open=True,
                registration_start__lte=today,
                registration_end__gte=today,
                coach_approvals__coach=player.coach,
                coach_approvals__is_active=True,
                coach_approvals__terms_accepted=True,
            )
            .distinct()
        )

        # پومسه: با Exists روی PoomsaeCoachApproval
        po_approval_exists = Exists(
            PoomsaeCoachApproval.objects.filter(
                competition=OuterRef("pk"),
                coach=player.coach,
                is_active=True,
                terms_accepted=True,
            )
        )

        po_qs = (
            PoomsaeCompetition.objects
            .filter(
                registration_open=True,
                registration_start__lte=today,
                registration_end__gte=today,
            )
            .annotate(_appr=po_approval_exists)
            .filter(_appr=True)
        )

        # خروجی یکسان و جمع‌شده
        out = (
                [{"public_id": c.public_id, "title": c.title, "style": "kyorugi"} for c in ky_qs] +
                [{"public_id": c.public_id, "title": c.title, "style": "poomsae"} for c in po_qs]
        )
        return Response(out, status=status.HTTP_200_OK)


# ---------- لیست مسابقات برای داور ----------
class RefereeCompetitionsList(views.APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        referee = UserProfile.objects.filter(user=request.user, role='referee').first()
        if not referee:
            return Response([], status=status.HTTP_200_OK)

        today = now().date()
        qs = (
            KyorugiCompetition.objects
            .filter(
                registration_open=True,
                registration_start__lte=today,
                registration_end__gte=today,
            )
            .distinct()
        )
        return Response(
            [{"public_id": c.public_id, "title": c.title} for c in qs],
            status=status.HTTP_200_OK
        )


# ---------- لیست داشبورد (کیوروگی) ----------
class DashboardKyorugiListView(views.APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def _detect_role(self, request):
        """
        نقش را از UserProfile اگر بود، وگرنه از باشگاه/گروه‌ها حدس بزن.
        خروجی: (role_str, profile_or_None)
        """
        prof = UserProfile.objects.filter(user=request.user).first()
        if prof and prof.role:
            return (prof.role or "").lower(), prof

        # club user؟ (اگر TkdClub به user فیلد FK دارد)
        if TkdClub.objects.filter(user=request.user).exists():
            return "club", None

        # heyat/board از گروه‌ها یا فیلد سفارشی
        if request.user.groups.filter(name__iexact="heyat").exists():
            return "heyat", None
        if request.user.groups.filter(name__iexact="board").exists():
            return "board", None

        # در غیر اینصورت نقش نامشخص
        return "", prof

    def get(self, request):
        role, profile = self._detect_role(request)
        only_open = str(request.query_params.get("only_open", "")).lower() in {"1", "true", "yes"}

        # پایه: همه مسابقات
        qs = KyorugiCompetition.objects.all()

        if role == "player":
            # بازیکن: فقط مسابقاتی که مربی‌اش تایید کرده
            if profile and profile.coach:
                today = now().date()
                qs = qs.filter(
                    coach_approvals__coach=profile.coach,
                    coach_approvals__is_active=True,
                    coach_approvals__terms_accepted=True,
                ).distinct()
                if only_open:
                    qs = qs.filter(
                        registration_open=True,
                        registration_start__lte=today,
                        registration_end__gte=today,
                    )
            else:
                qs = KyorugiCompetition.objects.none()

        elif role == "referee":
            # داور: مسابقات باز در بازه ثبت‌نام
            today = now().date()
            qs = qs.filter(
                registration_open=True,
                registration_start__lte=today,
                registration_end__gte=today,
            )

        else:
            # club / heyat / board / ناشناس
            if only_open:
                today = now().date()
                qs = qs.filter(
                    registration_open=True,
                    registration_start__lte=today,
                    registration_end__gte=today,
                )

        qs = qs.order_by("-id")
        data = DashboardKyorugiCompetitionSerializer(qs, many=True, context={"request": request}).data
        return Response(data, status=status.HTTP_200_OK)


# ---------- پیش‌پر کردن فرم ثبت‌نام خودی ----------
class RegisterSelfPrefillView(views.APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]  # بازیکن/داور/مربی

    def get(self, request, key):
        comp = _get_comp_by_key(key)
        prof = UserProfile.objects.filter(user=request.user).first()
        if not prof:
            return Response(
                {"can_register": False, "detail": "پروفایل کاربر یافت نشد."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # ---- helpers (لوکال) ----
        def _strip_phone(s: str) -> str:
            """هر شماره‌ای در انتهای رشته را حذف می‌کند (فارسی/عربی/انگلیسی)."""
            if not s:
                return ""
            t = str(s)
            # حذف علائم RTL نامرئی
            t = re.sub(r"[\u200e\u200f\u202a-\u202e\u2066-\u2069\u200c]", "", t)
            # تبدیل ارقام فارسی/عربی به انگلیسی
            trans = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
            t_norm = t.translate(trans)
            # حذف شماره در انتهای رشته
            t_norm = re.sub(r"[\s\-–—:|،]*[+(\[]?\d[\d\s\-\(\)]{6,}$", "", t_norm).strip()
            return t_norm if len(t_norm) < len(t) else t.strip()

        def _coach_name_only(p: UserProfile) -> str:
            if getattr(p, "coach", None):
                fn = getattr(p.coach, "first_name", "") or ""
                ln = getattr(p.coach, "last_name", "") or ""
                return f"{fn} {ln}".strip()
            # بعضی DBها coach_name را با شماره ذخیره کرده‌اند
            return _strip_phone(getattr(p, "coach_name", "") or "")

        def _belt_display(p: UserProfile) -> str:
            # ترتیب فالبک‌ها: belt_grade ← belt.(name|label|title) ← belt(str) ← belt_* متن
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
            # فیلدهای متنی رایج
            for name in ("belt_name", "belt_label", "belt_title"):
                v = getattr(p, name, None)
                if v:
                    return str(v)
            return ""

        def _parse_birthdate_to_date(val):
            """'1401/05/20' (jalali) یا '2023-08-11' یا '2023-08-11T00:00:00' → date | None"""
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
                    return date_cls(g.year, g.month, g.day)
                return date_cls(y, m_, d)
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

        # ---- can_register بر اساس وضعیت مسابقه ----
        rs = getattr(comp, "registration_start", None)
        re_ = getattr(comp, "registration_end", None)
        today = timezone.localdate()
        in_window = bool(rs and re_ and (rs <= today <= re_))
        if not (rs and re_):  # اگر تاریخ‌ها تعریف نشده‌اند، فقط فلگ open ملاک باشد
            in_window = bool(getattr(comp, "registration_open", False))
        can_register = bool(getattr(comp, "registration_open", False) and in_window)

        # ...
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
            "competition": {"public_id": comp.public_id, "title": comp.title},
            "can_register": can_register,
            "locked": {
                # snake_case
                "first_name": prof.first_name or getattr(request.user, "first_name", ""),
                "last_name":  prof.last_name  or getattr(request.user, "last_name",  ""),
                "national_code": national,
                "national_id":   national,
                "birth_date":    birth_text,
                "belt":          belt_text,
                "club":          club_name,
                "coach":         coach_name,

                # سازگاری camelCase
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
        # 1) رکورد را بگیر
        enrollment = get_object_or_404(Enrollment, id=enrollment_id)

        user = request.user
        allowed = False

        # 2) مجوزدهی
        # مالک کارت (بازیکن)
        if getattr(enrollment.player, "user_id", None) == user.id:
            allowed = True
        else:
            prof = UserProfile.objects.filter(user=user).first()

            # مربیِ همان ثبت‌نام
            if (
                prof and (
                    str(getattr(prof, "role", "")).lower() in {"coach", "both"}
                    or getattr(prof, "is_coach", False)
                )
                and enrollment.coach_id == prof.id
            ):
                allowed = True

            # باشگاهِ همان ثبت‌نام
            if not allowed:
                club = TkdClub.objects.filter(user=user).first()
                if club and enrollment.club_id == club.id:
                    allowed = True

            # هیئتِ همان ثبت‌نام
            if not allowed:
                board = TkdBoard.objects.filter(user=user).first()
                if board and enrollment.board_id == board.id:
                    allowed = True

        if not allowed:
            return Response({"detail": "اجازه دسترسی ندارید."}, status=status.HTTP_403_FORBIDDEN)

        # 3) فقط وقتی آماده است کارت بده
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

        # --- select_related امن بر اساس فیلدهای موجود در مدل اجرایی ---
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


def _parse_jalali_ymd(s: str) -> date | None:
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
        return date(g.year, g.month, g.day)
    except Exception:
        return None

def _player_birthdate_to_gregorian(p: UserProfile):
    # birth_date در پروفایل رشته است (احتمالاً جلالی)
    return _parse_jalali_ymd(p.birth_date)


def _allowed_belt_names_for_comp(comp: KyorugiCompetition):
    # اگر گروه کمربندی تنظیم شده، از همان استفاده کن (همان چیزی که تو DB داری)
    if comp.belt_groups.exists():
        belts = set()
        qs = BeltGroup.objects.filter(id__in=comp.belt_groups.values_list("id", flat=True)).prefetch_related("belts")
        for g in qs:
            belts.update(list(g.belts.values_list("name", flat=True)))
        return belts

    # در غیر اینصورت بر اساس belt_level (همه به فارسی تا با فیلد بازیکن بخواند)
    if comp.belt_level == "yellow_blue":
        return {"سفید", "زرد", "سبز", "آبی"}
    if comp.belt_level == "red_black":
        return {"قرمز"} | {f"مشکی دان {i}" for i in range(1, 11)}
    # all یا ناشناخته: همهٔ کمربندها به فارسی
    return {"سفید", "زرد", "سبز", "آبی", "قرمز"} | {f"مشکی دان {i}" for i in range(1, 11)}


def _age_ok_for_comp(p: UserProfile, comp: KyorugiCompetition):
    bd = _player_birthdate_to_gregorian(p)
    if not bd:
        return False
    cat = comp.age_category
    if not cat:
        return True
    # cat.from_date <= birth_date <= cat.to_date
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


class RegisterStudentsBulkView(views.APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [permissions.IsAuthenticated, IsCoach]

    @transaction.atomic
    def post(self, request, key):
        comp = _get_comp_by_key(key)
        coach = UserProfile.objects.filter(user=request.user, role__in=["coach", "both"], is_coach=True).first()
        if not coach:
            return Response({"detail": "پروفایل مربی یافت نشد."}, status=status.HTTP_404_NOT_FOUND)

        items = request.data.get("items") or []
        if not isinstance(items, list) or not items:
            return Response({"detail": "فهرست انتخاب خالی است."}, status=status.HTTP_400_BAD_REQUEST)

        today = now().date()
        if not (comp.registration_open and comp.registration_start <= today <= comp.registration_end):
            return Response({"detail": "ثبت‌نام این مسابقه فعال نیست یا خارج از بازه است."}, status=400)

        allowed_belts = _allowed_belt_names_for_comp(comp)
        req_gender = _required_gender_for_comp(comp)

        player_ids = [int(p) for p in [it.get("player_id") for it in items] if str(p).isdigit()]
        already = set(
            Enrollment.objects.filter(competition=comp, player_id__in=player_ids)
            .exclude(status="canceled")
            .values_list("player_id", flat=True)
        )

        created = []
        skipped_already, errors = [], {}

        for it in items:
            pid_raw = it.get("player_id")
            if not pid_raw:
                continue
            try:
                pid = int(pid_raw)
            except Exception:
                errors[str(pid_raw)] = "player_id نامعتبر است."
                continue

            if pid in already:
                skipped_already.append(pid); continue

            player = UserProfile.objects.filter(id=pid, role__in=["player","both"]).first()
            if not player or player.coach_id != coach.id:
                errors[str(pid)] = "بازیکن معتبر نیست یا شاگرد شما نیست."; continue

            # چک جنسیت در صورت محدودیت مسابقه
            if req_gender in ("male","female") and _gender_norm(player.gender) != req_gender:
                errors[str(pid)] = "جنسیت بازیکن با مسابقه سازگار نیست."; continue

            # کمربند و سن
            if player.belt_grade not in allowed_belts or not _age_ok_for_comp(player, comp):
                errors[str(pid)] = "شرایط کمربند/سن با مسابقه هم‌خوانی ندارد."; continue

            # تاریخ بیمه
            ins_g = _parse_jalali_ymd(it.get("insurance_issue_date") or "")
            if not ins_g:
                errors[str(pid)] = "تاریخ صدور بیمه نامعتبر است."; continue
            if comp.competition_date and ins_g > (comp.competition_date - timedelta(days=3)):
                errors[str(pid)] = "تاریخ صدور بیمه باید حداقل ۷۲ ساعت قبل از مسابقه باشد."; continue

            # وزن اعلامی
            try:
                w = float(str(it.get("declared_weight")).replace(",", "."))
            except Exception:
                w = 0.0
            if w <= 0:
                errors[str(pid)] = "وزن اعلامی نامعتبر است."; continue

            # ردهٔ وزنی مناسب (از DB)
            gender_for_wc = req_gender or _gender_norm(player.gender)
            wc = _find_weight_category_for(comp, gender_for_wc, w)
            if not wc:
                errors[str(pid)] = "ردهٔ وزنی مناسب یافت نشد."; continue

            club = getattr(player, "club", None)
            board = getattr(player, "tkd_board", None)

            e = Enrollment.objects.create(
                competition=comp,
                player=player,
                coach=coach,
                coach_name=f"{coach.first_name} {coach.last_name}".strip(),
                club=club,   club_name=(getattr(club, "club_name", "") or ""),
                board=board, board_name=(getattr(board, "name", "") or ""),
                belt_group=comp.belt_groups.filter(belts__name=player.belt_grade).first()
                    if comp.belt_groups.exists() else None,
                weight_category=wc,
                declared_weight=w,
                insurance_number=str(it.get("insurance_number") or ""),
                insurance_issue_date=ins_g,
                status="pending_payment",
                is_paid=False,
                paid_amount=0,
            )
            created.append(e)

        total_amount = (comp.entry_fee or 0) * len(created)
        simulate_paid = (not getattr(settings, "PAYMENTS_ENABLED", False)) or (comp.entry_fee == 0)

        if simulate_paid:
            out = []
            for e in created:
                e.mark_paid(amount=comp.entry_fee or 0, ref_code=f"TEST-BULK-{e.id:06d}")
                out.append({
                    "enrollment_id": e.id,
                    "status": e.status,
                    "player": {"id": e.player_id, "name": f"{e.player.first_name} {e.player.last_name}"},
                })
            return Response({
                "detail": "ثبت‌نام انجام و پرداخت آزمایشی شد.",
                "total_amount": total_amount,
                "enrollments": out,
                "enrollment_ids": [x["enrollment_id"] for x in out],
                "skipped_already_enrolled": skipped_already,
                "errors": errors,
            }, status=201)

        return Response({
            "detail": "ثبت‌نام ایجاد شد. پرداخت لازم است.",
            "total_amount": total_amount,
            "created_ids": [e.id for e in created],
            "enrollment_ids": [e.id for e in created],
            "skipped_already_enrolled": skipped_already,
            "errors": errors,
        }, status=201)



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
            data["enrollment_id"] = e.id  # برای نگهداشت ترتیب در فرانت
            out.append(data)

        # حفظ ترتیب درخواست
        out_sorted = []
        by_id = {item.get("enrollment_id"): item for item in out}
        for i in ids:
            if i in by_id:
                out_sorted.append(by_id[i])

        return Response(out_sorted, status=status.HTTP_200_OK)


def _parse_birthdate_to_date(s):
    """'1401/05/20' (jalali) یا '2023-08-11' → datetime.date یا None"""
    if not s:
        return None
    t = str(s).strip().replace('-', '/')
    try:
        y, m, d = [int(x) for x in t.split('/')[:3]]
        if y < 1700:
            return jdatetime.date(y, m, d).togregorian()
        return date_cls(y, m, d)
    except Exception:
        return None


def _coach_from_request(request):
    return UserProfile.objects.filter(user=request.user, role__in=["coach", "both"]).first()


def _allowed_belt_names(comp: KyorugiCompetition) -> set[str]:
    if comp.belt_groups.exists():
        return set(Belt.objects.filter(
            beltgroup__in=comp.belt_groups.all()
        ).values_list("name", flat=True))
    # اگر گروه مشخص نشده بود، همه کمربندها مجاز فرض می‌شوند
    return set(Belt.objects.values_list("name", flat=True))


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



# ───────── POST: ثبت‌نام گروهی شاگردها با جلوگیری از تکرار ─────────
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

            # محدودیت جنسیت مسابقه
            if req_gender in ("male","female") and _gender_norm(player.gender) != req_gender:
                errors[str(pid)] = "جنسیت بازیکن با مسابقه سازگار نیست."; continue

            # تاریخ بیمه
            raw_ins = (it.get("insurance_issue_date") or "").replace("-", "/")
            try:
                y, m, d = [int(x) for x in raw_ins.split("/")[:3]]
                ins_date = jdatetime.date(y, m, d).togregorian() if y < 1700 else date_cls(y, m, d)
            except Exception:
                errors[str(pid)] = "تاریخ صدور بیمه نامعتبر است."; continue
            if comp.competition_date and ins_date > (comp.competition_date - timedelta(days=3)):
                errors[str(pid)] = "تاریخ صدور بیمه باید حداقل ۷۲ ساعت قبل از مسابقه باشد."; continue

            # وزن
            try:
                declared_weight = float(str(it.get("declared_weight")).replace(",", "."))
            except Exception:
                declared_weight = 0.0
            if declared_weight <= 0:
                errors[str(pid)] = "وزن اعلامی نامعتبر است."; continue

            # گروه کمربند (از DB)
            belt_group = comp.belt_groups.filter(belts__name=player.belt_grade).first() if comp.belt_groups.exists() else None

            # ردهٔ وزنی
            weight_cat = None
            if allowed_weight_ids:
                gender_for_wc = req_gender or _gender_norm(player.gender)
                weight_cat = WeightCategory.objects.filter(
                    id__in=allowed_weight_ids,
                    gender=gender_for_wc,
                    min_weight__lte=declared_weight,
                    max_weight__gte=declared_weight,
                ).order_by("min_weight").first()

            e = Enrollment.objects.create(
                competition=comp,
                player=player,
                coach=coach,
                coach_name=f"{coach.first_name} {coach.last_name}".strip(),
                club=getattr(player, "club", None),
                club_name=getattr(player.club, "club_name", "") if getattr(player, "club", None) else "",
                board=getattr(player, "tkd_board", None),
                board_name=getattr(player.tkd_board, "name", "") if getattr(player, "tkd_board", None) else "",
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
                "bronze1_enrollment__player", "bronze1_enrollment__club",
                "bronze2_enrollment__player", "bronze2_enrollment__club",
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

# صفحه‌بندی پیش‌فرض
class DefaultPagination(PageNumberPagination):
    page_size = 12
    page_size_query_param = "page_size"
    max_page_size = 100


# لیست عمومی سمینارها (فیلتر/جستجو/مرتب‌سازی)
class SeminarListView(generics.ListAPIView):
    serializer_class = SeminarSerializer
    permission_classes = [permissions.AllowAny]
    pagination_class = DefaultPagination

    def get_queryset(self):
        qs = Seminar.objects.all()

        # جستجو
        q = (self.request.query_params.get("q") or "").strip()
        if q:
            qs = qs.filter(
                Q(title__icontains=q) |
                Q(description__icontains=q) |
                Q(location__icontains=q)
            )

        # فیلتر نقش Cross-DB
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

        # بازهٔ تاریخ برگزاری
        date_from = (self.request.query_params.get("date_from") or "").strip()
        date_to   = (self.request.query_params.get("date_to") or "").strip()
        if date_from:
            qs = qs.filter(event_date__gte=date_from)
        if date_to:
            qs = qs.filter(event_date__lte=date_to)

        # فقط رویدادهای باز
        open_only = self.request.query_params.get("open")
        if open_only in ("1", "true", "True"):
            today = timezone.localdate()
            qs = qs.filter(registration_start__lte=today, registration_end__gte=today)

        # آینده/گذشته
        upcoming = self.request.query_params.get("upcoming")
        past     = self.request.query_params.get("past")
        today = timezone.localdate()
        if upcoming in ("1", "true", "True"):
            qs = qs.filter(event_date__gte=today)
        if past in ("1", "true", "True"):
            qs = qs.filter(event_date__lt=today)

        # مرتب‌سازی
        ordering = self.request.query_params.get("ordering") or "event_date"
        allowed = {"event_date", "-event_date", "created_at", "-created_at", "title", "-title"}
        if ordering not in allowed:
            ordering = "event_date"
        return qs.order_by(ordering, "id")

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["request"] = self.request
        return ctx


# جزئیات سمینار بر اساس public_id
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


# ثبت‌نام کاربر در سمینار
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

        # پرداخت غیرفعال (الان)
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
    else:  # all
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


# ------------------------------------------------------------- پومسه (اختیاری/ایمن) -------------------------------------------------------------

class DashboardPoomsaeListView(views.APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        # اگر مدل پومسه فعال نیست
        if not POOMSAE_ENABLED:
            return Response([], status=200)

        # تشخیص نقش
        role = ""
        prof = UserProfile.objects.filter(user=request.user).first()
        if prof and prof.role:
            role = (prof.role or "").lower()
        elif TkdClub.objects.filter(user=request.user).exists():
            role = "club"
        elif request.user.groups.filter(name__iexact="heyat").exists():
            role = "heyat"
        elif request.user.groups.filter(name__iexact="board").exists():
            role = "board"

        only_open = str(request.query_params.get("only_open", "")).lower() in {"1", "true", "yes"}
        today = now().date()

        # پایهٔ کوئری (بدون انتخاب فیلدهای مشکل‌زا)
        qs = PoomsaeCompetition.objects.all().defer("terms_template")

        if role == "player":
            # بازیکن فقط مسابقاتی را ببیند که مربی‌اش تعهد را تأیید کرده
            if prof and getattr(prof, "coach", None):
                appr_exists = Exists(
                    PoomsaeCoachApproval.objects.filter(
                        competition=OuterRef("pk"),
                        coach=prof.coach,
                        is_active=True,
                        terms_accepted=True,
                    )
                )
                qs = qs.annotate(_appr=appr_exists).filter(_appr=True)
                if only_open:
                    qs = qs.filter(
                        registration_open=True,
                        registration_start__lte=today,
                        registration_end__gte=today,
                    )
            else:
                qs = PoomsaeCompetition.objects.none()

        elif role == "referee" or only_open:
            # داور یا وقتی فقطِ باز: فقط مسابقات باز در بازهٔ ثبت‌نام
            qs = qs.filter(
                registration_open=True,
                registration_start__lte=today,
                registration_end__gte=today,
            )

        # مرتب‌سازی: نزدیک‌ترین‌ها بالاتر
        qs = qs.order_by("-competition_date", "-id")

        # خروجی
        if POOMSAE_SERIALIZER_ENABLED:
            try:
                data = DashboardPoomsaeCompetitionSerializer(
                    qs, many=True, context={"request": request}
                ).data
            except (OperationalError, ProgrammingError):
                data = []
        else:
            # fallback سبک
            base_fields = (
                "id", "public_id", "title", "style_display", "style",
                "registration_open", "registration_start", "registration_end",
                "competition_date", "poster"
            )
            data = list(qs.values(*base_fields))
            for d in data:
                d["style_display"] = d.get("style_display") or d.get("style") or "پومسه"

        return Response(data, status=200)


class DashboardAllCompetitionsView(views.APIView):
    """خروجی تجمیعی: کیوروگی + پومسه (در صورت فعال بودن)."""
    authentication_classes = [JWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        # نقش
        role = ""
        profile = UserProfile.objects.filter(user=request.user).first()
        if profile and profile.role:
            role = (profile.role or "").lower()
        elif TkdClub.objects.filter(user=request.user).exists():
            role = "club"
        elif request.user.groups.filter(name__iexact="heyat").exists():
            role = "heyat"
        elif request.user.groups.filter(name__iexact="board").exists():
            role = "board"

        only_open = str(request.query_params.get("only_open", "")).lower() in {"1", "true", "yes"}
        today = now().date()

        # Kyorugi (منطق همان داشبورد کیوروگی)
        ky = KyorugiCompetition.objects.all()
        if role == "player":
            if profile and getattr(profile, "coach", None):
                ky = ky.filter(
                    coach_approvals__coach=profile.coach,
                    coach_approvals__is_active=True,
                    coach_approvals__terms_accepted=True,
                ).distinct()
                if only_open:
                    ky = ky.filter(registration_open=True, registration_start__lte=today, registration_end__gte=today)
            else:
                ky = KyorugiCompetition.objects.none()
        elif role == "referee":
            ky = ky.filter(registration_open=True, registration_start__lte=today, registration_end__gte=today)
        else:
            if only_open:
                ky = ky.filter(registration_open=True, registration_start__lte=today, registration_end__gte=today)

        ky_data = DashboardKyorugiCompetitionSerializer(ky, many=True, context={"request": request}).data

        # Poomsae (اگر موجود)
        po_data = []
        if POOMSAE_ENABLED:
            po = PoomsaeCompetition.objects.all().defer("terms_template")

            if role == "player":
                if profile and getattr(profile, "coach", None):
                    appr_exists = Exists(
                        PoomsaeCoachApproval.objects.filter(
                            competition=OuterRef("pk"),
                            coach=profile.coach,
                            is_active=True,
                            terms_accepted=True,
                        )
                    )
                    po = po.annotate(_appr=appr_exists).filter(_appr=True)
                    if only_open:
                        po = po.filter(registration_open=True, registration_start__lte=today,
                                       registration_end__gte=today)
                else:
                    po = PoomsaeCompetition.objects.none()

            elif role == "referee" or only_open:
                po = po.filter(registration_open=True, registration_start__lte=today, registration_end__gte=today)

            if POOMSAE_SERIALIZER_ENABLED:
                try:
                    po_data = DashboardPoomsaeCompetitionSerializer(po, many=True, context={"request": request}).data
                except (OperationalError, ProgrammingError):
                    po_data = []
            else:
                base_fields = (
                    "id", "public_id", "title", "style_display", "style",
                    "registration_open", "registration_start", "registration_end",
                    "competition_date", "poster"
                )
                po_data = list(po.values(*base_fields))
                for d in po_data:
                    d["style_display"] = d.get("style_display") or d.get("style") or "پومسه"

        data = ky_data + po_data
        # مرتب‌سازی نزولی بر اساس تاریخ برگزاری (در صورت نبود، بر اساس id)
        def _sort_key(x):
            return (x.get("competition_date") or "") or str(x.get("id") or "")
        data.sort(key=_sort_key, reverse=True)

        return Response(data, status=200)





def _get_coach_profile(user):
    """
    پروفایل مربی را «انعطاف‌پذیر» برگردان:
    یا is_coach=True یا role در ['coach','both'].
    """
    prof = UserProfile.objects.filter(user=user).first()
    if not prof:
        raise Http404("پروفایل پیدا نشد.")
    role_ok = str(getattr(prof, "role", "")).lower() in {"coach", "both"}
    if getattr(prof, "is_coach", False) or role_ok:
        return prof
    raise Http404("پروفایل مربی معتبر نیست.")

class PoomsaeCoachApprovalStatusAPI(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, public_id):
        comp = get_object_or_404(PoomsaeCompetition, public_id=public_id)
        coach = _get_coach_profile(request.user)

        appr = PoomsaeCoachApproval.objects.filter(competition=comp, coach=coach).first()
        data = {
            "approved": bool(appr and appr.terms_accepted and getattr(appr, "is_active", False)),
            "code": appr.code if appr else "",
            "coach_name": getattr(coach, "full_name", f"{coach.first_name} {coach.last_name}".strip()),
            "club_names": [getattr(getattr(coach, "club", None), "name", "")] if getattr(coach, "club_id", None) else [],
        }
        return Response(data)

class PoomsaeCoachApproveAPI(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, public_id):
        comp = get_object_or_404(PoomsaeCompetition, public_id=public_id)
        coach = _get_coach_profile(request.user)

        appr, _ = PoomsaeCoachApproval.objects.select_for_update().get_or_create(
            competition=comp, coach=coach,
            defaults={"terms_accepted": True, "is_active": True, "approved_at": timezone.now()}
        )

        changed = []
        if not appr.terms_accepted:
            appr.terms_accepted = True; changed.append("terms_accepted")
        if not appr.is_active:
            appr.is_active = True; changed.append("is_active")
        if not appr.approved_at:
            appr.approved_at = timezone.now(); changed.append("approved_at")
        if changed:
            appr.save(update_fields=changed)

        if not appr.code:
            appr.set_fresh_code(save=True, force=True)

        appr.refresh_from_db(fields=("code", "approved_at"))

        return Response({"code": appr.code, "approved_at": appr.approved_at}, status=200)


log = logging.getLogger(__name__)

try:
    from accounts.models import UserProfile  # یا ApprovedCoach
except Exception:
    UserProfile = None

class CoachApprovalApproveView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, public_id: str):
        agree = request.data.get("agree", True)
        if agree in (False, "false", "0", 0):
            return Response({"detail": "پذیرش تعهدنامه الزامی است."},
                            status=status.HTTP_400_BAD_REQUEST)

        comp = get_object_or_404(KyorugiCompetition, public_id=public_id)

        user = request.user
        coach = getattr(user, "userprofile", None) or getattr(user, "profile", None)
        if coach is None and UserProfile is not None:
            coach = UserProfile.objects.filter(user=user).first()
        if coach is None:
            return Response({"detail": "پروفایل مربی پیدا نشد."},
                            status=status.HTTP_400_BAD_REQUEST)

        approval, _created = CoachApproval.objects.get_or_create(
            competition=comp,
            coach=coach,
        )

        # 👇 حتماً اگر کد ندارد، بساز (این مسیر مجازِ تغییر کد است)
        if not approval.code:
            approval.set_fresh_code(save=True, force=True)

        now = timezone.now()
        CoachApproval.objects.filter(pk=approval.pk).update(
            terms_accepted=True,
            is_active=True,
            approved_at=now,
        )
        approval.refresh_from_db(fields=("code", "terms_accepted", "is_active", "approved_at"))

        return Response(
            {"code": approval.code, "approved_at": approval.approved_at},
            status=status.HTTP_200_OK,
        )


# ---------- جزئیات مسابقه (کیوروگی/پومسه) ----------


def _as_date(val):
    """
    هر نوع تاریخ را (date/datetime/str شمسی یا میلادی) به date تبدیل می‌کند.
    اگر نشد → None
    """
    if not val:
        return None
    # اگر خودِ date است (و datetime نیست)
    if isinstance(val, date_cls) and not isinstance(val, dt_cls):
        return val
    # اگر datetime است
    if isinstance(val, dt_cls):
        return val.date()
    # اگر رشته است: YYYY-MM-DD یا YYYY/MM/DD یا شمسی
    try:
        s = str(val).strip().replace('-', '/')
        y, m, d = [int(x) for x in s.split('/')[:3]]
        if y < 1700:  # شمسی
            return jdatetime.date(y, m, d).togregorian()
        return date_cls(y, m, d)
    except Exception:
        return None



class CompetitionDetailAnyView(views.APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [permissions.AllowAny]

    # -------- helpers --------
    @staticmethod
    def _as_date(val):
        if not val:
            return None
        if isinstance(val, date_cls) and not isinstance(val, dt_cls):
            return val
        if isinstance(val, dt_cls):
            return val.date()
        try:
            s = str(val).strip().replace("-", "/")
            y, m, d = [int(x) for x in s.split("/")[:3]]
            if y < 1700:
                return jdatetime.date(y, m, d).togregorian()
            return date_cls(y, m, d)
        except Exception:
            return None




    _RTL = r"[\u200e\u200f\u202a-\u202e\u2066-\u2069\u200c]"
    _TBL = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")

    def _find_birth_source(player, user=None):
        """از روی چند نامِ رایج، تاریخ تولد را پیدا می‌کند."""
        candidates = [
            "birth_date", "birthDate", "date_of_birth", "dob",
            "birth", "birthday",
        ]
        for name in candidates:
            v = getattr(player, name, None)
            if v:
                return v
        # فالبک: از خود user هم امتحان کن
        if user is not None:
            for name in candidates:
                v = getattr(user, name, None)
                if v:
                    return v
        return None

    def _parse_birth_to_gregorian(value):


        if isinstance(value, _d) and not isinstance(value, _dt):
            return value
        if isinstance(value, _dt):
            return value.date()

        s = str(value or "").strip()
        if not s:
            return None
        # پاکسازی
        s = re.sub(_RTL, "", s)
        s = s.translate(_TBL)
        s = s.replace("-", "/")
        # اگر تاریخ/زمان است، فقط بخش تاریخ را بگیر
        s = s.split("T", 1)[0].strip()

        # استخراج y/m/d
        m = re.match(r"^\s*(\d{3,4})[\/\.](\d{1,2})[\/\.](\d{1,2})", s)
        if not m:
            # شاید ISO کامل بوده (2024-09-01) که قبلاً با / جایگزین کردیم؛
            # دوباره امتحان با ISO از 10 کاراکتر اول:
            try:
                return _d.fromisoformat(s.replace("/", "-")[:10])
            except Exception:
                return None

        y, mo, d = map(int, m.groups())
        try:
            if y < 1700:  # جلالی
                g = jdatetime.date(y, mo, d).togregorian()
                return _d(g.year, g.month, g.day)
            else:  # میلادی با اسلش
                return _d(y, mo, d)
        except Exception:
            return None

    @staticmethod
    def _to_jalali_str(d):
        try:
            return jdatetime.date.fromgregorian(date=d).strftime("%Y/%m/%d") if d else None
        except Exception:
            return None

    @staticmethod
    def _safe_url(f):
        try:
            return f.url
        except Exception:
            return str(f) if f else None

    # داخل CompetitionDetailAnyView
    def _poomsae_user_eligible(self, comp, user):
        if not user or not getattr(user, "is_authenticated", False):
            return None
        prof = (UserProfile.objects.filter(user=user, role__in=["player", "both"]).first()
                or UserProfile.objects.filter(user=user).first())
        if not prof:
            return False

        rg = _required_gender_for_comp(comp)  # ⬅️ اصلاح
        pg = _norm_gender(getattr(prof, "gender", None))
        gender_ok = True if rg in (None, "", "both") else bool(pg and (pg == rg))

        allowed = set()
        if getattr(comp, "belt_groups", None) and comp.belt_groups.exists():
            for g in comp.belt_groups.all().prefetch_related("belts"):
                for b in g.belts.all():
                    nm = getattr(b, "name", "") or getattr(b, "label", "")
                    code = _norm_belt(nm)
                    if code:
                        allowed.add(code)

        player_belt_code = _player_belt_code_from_profile(prof)
        belt_ok = True if not allowed else bool(player_belt_code and player_belt_code in allowed)
        return bool(gender_ok and belt_ok)

    # -------- GET --------
    def get(self, request, key):
        comp = _get_comp_any_by_key(key)

        # ----------------------- پومسه -----------------------
        if PoomsaeCompetition and isinstance(comp, PoomsaeCompetition):
            # گروه‌های کمربندی (برچسب برای نمایش)
            belt_labels = []
            try:
                if hasattr(comp, "belt_groups") and comp.belt_groups.exists():
                    belt_labels = list(
                        comp.belt_groups.values_list("label", flat=True)
                    ) or list(comp.belt_groups.values_list("name", flat=True))
            except Exception:
                belt_labels = []

            # گروه‌های سنی (نمایشی – در صورت وجود)
            age_groups = []
            for fld in ("age_groups", "age_categories"):
                rel = getattr(comp, fld, None)
                if hasattr(rel, "values_list"):
                    age_groups = list(rel.values_list("name", flat=True)) or \
                                 list(rel.values_list("title", flat=True))
                    if age_groups:
                        break

            # شهر، نشانی، پوستر/تصاویر/فایل‌ها
            city = getattr(comp, "city", "") or getattr(comp, "location_city", "")
            address = (
                getattr(comp, "address", "") or
                getattr(comp, "location", "") or
                getattr(getattr(comp, "place", None), "address", "")
            )

            images_built = []
            poster = getattr(comp, "poster", None)
            poster_url = self._safe_url(poster) if poster else None
            if poster_url:
                images_built.append({"url": poster_url, "title": "پوستر"})

            for fld in ("images", "photos", "gallery"):
                rel = getattr(comp, fld, None)
                if hasattr(rel, "all"):
                    for im in rel.all():
                        u = getattr(im, "url", None) or getattr(im, "image_url", None)
                        if not u:
                            u = self._safe_url(getattr(im, "image", None) or getattr(im, "file", None))
                        if u:
                            images_built.append({
                                "url": u,
                                "title": getattr(im, "title", "") or getattr(im, "caption", "") or ""
                            })

            files_built = []
            for fld in ("files", "attachments", "docs", "documents"):
                rel = getattr(comp, fld, None)
                if hasattr(rel, "all"):
                    for f in rel.all():
                        fu = getattr(f, "url", None) or getattr(f, "file_url", None)
                        if not fu:
                            fu = self._safe_url(getattr(f, "file", None) or getattr(f, "document", None))
                        if fu:
                            files_built.append({
                                "name": getattr(f, "name", "") or getattr(f, "title", "") or f"فایل {getattr(f, 'id', '')}",
                                "url": fu,
                            })

            # تاریخ‌ها
            rs = self._as_date(getattr(comp, "registration_start", None))
            re_ = self._as_date(getattr(comp, "registration_end", None))
            cd = self._as_date(getattr(comp, "competition_date", None))

            data = {
                "id": comp.id,
                "public_id": comp.public_id,
                "title": comp.title,
                "style_display": getattr(comp, "style_display", "پومسه") or "پومسه",

                "registration_open": bool(getattr(comp, "registration_open", False)),
                "registration_start": rs,
                "registration_end": re_,
                "competition_date": cd,
                "registration_start_jalali": self._to_jalali_str(rs),
                "registration_end_jalali": self._to_jalali_str(re_),
                "competition_date_jalali": self._to_jalali_str(cd),

                "entry_fee": getattr(comp, "entry_fee", 0),
                "gender_display": getattr(comp, "get_gender_display", lambda: "")() or None,

                "belt_groups": belt_labels,
                "belt_groups_display": "، ".join([b for b in belt_labels if b]) or None,

                "age_groups": age_groups,
                "age_groups_display": "، ".join([g for g in age_groups if g]) or None,

                "city": city or "",
                "address": address or "",
                "address_full": "، ".join([p for p in [city, address] if p]) or "",

                "poster": poster_url,
                "images": images_built,
                "files": files_built,
            }

            # can_register = ثبت‌نام باز + داخل بازه (یا اگر تاریخ‌ها خالی‌اند، فقط فلگ باز بودن)
            today = timezone.localdate()
            in_window = bool(rs and re_ and (rs <= today <= re_))
            if not (rs and re_):
                in_window = bool(data["registration_open"])
            data["can_register"] = bool(data["registration_open"] and in_window)

            # -------- صلاحیت پومسه: جنسیت + کمربند (بدون شرط سن) --------
            eligible = self._poomsae_user_eligible(comp, request.user)
            data["user_eligible_self"] = eligible

            # (اختیاری) دیباگ
            if str(request.query_params.get("debug") or "").lower() in {"1", "true", "yes"}:
                prof = (UserProfile.objects.filter(user=request.user, role__in=["player","both"]).first()
                        if request.user and request.user.is_authenticated else None)

                # کمربندهای مجاز نرمال‌شده
                allowed_belts_norm = set()
                if getattr(comp, "belt_groups", None) and comp.belt_groups.exists():
                    for g in comp.belt_groups.all().prefetch_related("belts"):
                        for b in g.belts.all():
                            nm = getattr(b, "name", "") or getattr(b, "label", "")
                            code = _norm_belt(nm)
                            if code:
                                allowed_belts_norm.add(code)

                data["eligibility_debug"] = {
                    "required_gender": _norm_gender(getattr(comp, "gender", None)),
                    "player_gender": _norm_gender(getattr(prof, "gender", None)) if prof else None,
                    "player_belt": _player_belt_code_from_profile(prof) if prof else None,
                    "allowed_belts_norm": sorted(list(allowed_belts_norm)) if allowed_belts_norm else "(no belt limit)",
                    "gender_ok": None if eligible is None else (
                        True if _norm_gender(getattr(comp, "gender", None)) in (None,"","both")
                        else (_norm_gender(getattr(prof, "gender", None)) == _norm_gender(getattr(comp, "gender", None)) if prof else False)
                    ),
                }

            return Response(data, status=status.HTTP_200_OK)

        # ----------------------- کیوروگی -----------------------
        ser = KyorugiCompetitionDetailSerializer(comp, context={"request": request})
        data = dict(ser.data)

        # وضعیت ثبت‌نام خودِ بازیکن (اگر لاگین کرده)
        if request.user and request.user.is_authenticated:
            player = UserProfile.objects.filter(user=request.user, role__in=["player", "both"]).first()
            if player:
                enr = Enrollment.objects.filter(competition=comp, player=player).order_by("-id").first()
                if enr:
                    data["my_enrollment"] = {"id": enr.id, "status": enr.status}
                    data["card_ready"] = enr.status in {"paid", "confirmed", "approved", "accepted", "completed"}
                else:
                    data["my_enrollment"] = None
                    data["card_ready"] = False

        return Response(data, status=status.HTTP_200_OK)


def _resolve_enrollment_model_for(comp_obj_or_cls=None):
    """
    مدلی را برمی‌گرداند که FK به کلاس مسابقهٔ داده‌شده داشته باشد
    (ترجیح: PoomsaeEnrollment برای پومسه).
    """
    target_cls = None
    if comp_obj_or_cls is not None:
        target_cls = comp_obj_or_cls if isinstance(comp_obj_or_cls, type) else comp_obj_or_cls.__class__

    preferred_labels = [
        # اول پومسه‌ها
        "competitions.PoomsaeEnrollment",
        "enrollments.PoomsaeEnrollment",
        # بعد جنریک/قدیمی
        "competitions.Enrollment",
        "enrollments.Enrollment",
        "competitions.CompetitionEnrollment",
        "enrollments.CompetitionEnrollment",
    ]

    # 1) تلاش با لیبل‌های شناخته‌شده و تایید FK به کلاس هدف
    for label in preferred_labels:
        try:
            m = apps.get_model(label)
            if not m:
                continue
            if target_cls is None:
                return m
            for f in m._meta.get_fields():
                if isinstance(f, ForeignKey) and f.related_model is target_cls:
                    return m
        except Exception:
            continue

    # 2) اسکن همهٔ مدل‌ها و یافتن هر مدلی که FK به کلاس هدف دارد
    if target_cls is not None:
        for m in apps.get_models():
            for f in m._meta.get_fields():
                if isinstance(f, ForeignKey) and f.related_model is target_cls:
                    return m

    return None


def _try_get_playerish_instance(user):
    """
    سعی می‌کند یک آبجکت «پروفایل بازیکن‌مانند» مربوط به user برگرداند،
    و اگر چیزی پیدا نشد خود user را برمی‌گرداند.
    """
    # رایج‌ترین اتریبیوت‌ها روی User
    for attr in ("playerprofile", "athleteprofile", "profile", "userprofile"):
        inst = getattr(user, attr, None)
        if inst:
            return inst

    # جست‌وجوی مدل‌های پروفایلی که OneToOne/FK به User دارند
    User = get_user_model()
    for Model in apps.get_models():
        name = Model.__name__.lower()
        if "profile" not in name and "athlete" not in name and "player" not in name:
            continue
        for f in Model._meta.get_fields():
            if isinstance(f, (OneToOneField, ForeignKey)) and f.related_model is User:
                try:
                    return Model.objects.get(**{f.name: user})
                except Model.DoesNotExist:
                    continue

    # فالبک: خود user
    return user


def _fk_name_pointing_to(model_cls, target_obj):
    """نام فیلد FK که به کلاس target_obj اشاره می‌کند را پیدا کن."""
    from django.db.models import ForeignKey as FK
    for f in model_cls._meta.get_fields():
        if isinstance(f, FK) and f.related_model is target_obj.__class__:
            return f.name
    return None


def _first_existing_attr(obj, names, default=None):
    for n in names:
        if hasattr(obj, n):
            return getattr(obj, n)
    return default


class PoomsaeMyEnrollmentView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, public_id):
        # 1) مسابقه پومسه
        comp = get_object_or_404(PoomsaeCompetition, public_id=public_id)

        # 2) مدل ثبت‌نام متناظر با همین مسابقه
        Enr = _resolve_enrollment_model_for(comp)
        if Enr is None:
            return Response({"enrollment_id": None, "status": None, "can_show_card": False}, status=200)

        # 3) آبجکت بازیکن‌مانند (پروفایل) یا خودِ User
        playerish = _try_get_playerish_instance(request.user)
        User = get_user_model()

        # 4) کشف نام فیلدهای FK به مسابقه و بازیکن/یوزر
        fk_comp = _fk_name_pointing_to(Enr, comp) or next(
            (g for g in ("poomsae_competition", "competition", "comp", "competition_obj") if hasattr(Enr, g)), None
        )
        fk_player = _fk_name_pointing_to(Enr, playerish) or next(
            (g for g in ("player", "athlete", "profile", "user_profile") if hasattr(Enr, g)), None
        )

        # اگر FK به پروفایل نبود، امتحان کن مستقیم به User باشد
        if fk_player is None:
            for f in Enr._meta.get_fields():
                if isinstance(f, ForeignKey) and f.related_model is User:
                    fk_player = f.name
                    playerish = request.user
                    break

        if not fk_comp or not fk_player:
            return Response({"enrollment_id": None, "status": None, "can_show_card": False}, status=200)

        # 5) فیلتر و آخرین ثبت‌نامِ کاربر
        try:
            qs = Enr.objects.filter(**{fk_comp: comp, fk_player: playerish})
            # اگر فیلد زمان/ایجاد داشت از آن مرتب کن، وگرنه بر اساس id
            order_field = "-created_at" if hasattr(Enr, "created_at") else "-id"
            enr = qs.order_by(order_field).first()
        except Exception:
            # هر مشکل در فیلترکردن/کست‌کردن → graceful بازگشت
            return Response({"enrollment_id": None, "status": None, "can_show_card": False}, status=200)

        if not enr:
            return Response({"enrollment_id": None, "status": None, "can_show_card": False}, status=200)

        # 6) وضعیت و اجازه نمایش کارت
        status_value = _first_existing_attr(enr, ("status", "state", "enrollment_status"), None)
        status_str = (str(status_value) if status_value is not None else "").lower()
        can_show = status_str in CARD_READY_STATUSES  # استفاده از ثابت سراسری

        return Response(
            {
                "enrollment_id": getattr(enr, "id", None),
                "status": status_value,
                "can_show_card": can_show,
            },
            status=200,
        )




class PoomsaeCompetitionViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = PoomsaeCompetition.objects.all()
    lookup_field = "public_id"

    def get_serializer_class(self):
        if self.action == "retrieve":
            return PoomsaeCompetitionDetailSerializer
        return DashboardPoomsaeCompetitionSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["request"] = self.request  # ← مهم برای user_eligible_self
        return ctx
    @action(detail=True, methods=["get"], url_path="eligibility-debug")
    def eligibility_debug(self, request, public_id=None):
        comp = self.get_object()
        ser  = PoomsaeCompetitionDetailSerializer(comp, context={"request": request})
        return Response({
            "can_register": ser.get_can_register(comp),
            "user_eligible_self": ser.get_user_eligible_self(comp),
            "eligibility_debug": ser.get_eligibility_debug(comp),
        })
# views.py



def _parse_jalali_date(s: str):
    if not s:
        return None
    try:
        s = str(s).strip().replace('-', '/')
        y, m, d = [int(x) for x in s.split('/')[:3]]
        return jdatetime.date(y, m, d).togregorian() if y < 1700 else date_cls(y, m, d)
    except Exception:
        return None





class PoomsaeRegisterSelfView(APIView):

    permission_classes = [IsAuthenticated]
    authentication_classes = [JWTAuthentication]

    @staticmethod
    def _fa2en(s: str) -> str:
        fa = "۰۱۲۳۴۵۶۷۸۹"
        ar = "٠١٢٣٤٥٦٧٨٩"
        out = []
        for ch in str(s):
            if ch in fa:
                out.append(str(fa.index(ch)))
            elif ch in ar:
                out.append(str(ar.index(ch)))
            else:
                out.append(ch)
        return "".join(out)

    @staticmethod
    def _div(a, b):
        return int(a // b)

    _jal_breaks = [-61,9,38,199,426,686,756,818,1111,1181,1210,1635,2060,2097,2192,2262,2324,2394,2456,3178]

    @classmethod
    def _jal_cal(cls, jy):
        gy = jy + 621
        leapJ = -14
        jp = cls._jal_breaks[0]
        for jm in cls._jal_breaks[1:]:
            jump = jm - jp
            if jy < jm:
                break
            leapJ += cls._div(jump, 33) * 8 + cls._div(jump % 33, 4)
            jp = jm
        n = jy - jp
        leapJ += cls._div(n, 33) * 8 + cls._div(n % 33, 4)
        leapG = cls._div(gy, 4) - cls._div(cls._div(gy, 100) + 1, 4) + cls._div(gy, 400) - 70
        march = 20 + leapJ - leapG
        return gy, march

    @classmethod
    def _g2d(cls, gy, gm, gd):
        a = cls._div(14 - gm, 12)
        y = gy + 4800 - a
        m = gm + 12 * a - 3
        return gd + cls._div(153 * m + 2, 5) + 365 * y + cls._div(y, 4) - cls._div(y, 100) + cls._div(y, 400) - 32045

    @classmethod
    def _d2g(cls, jdn):
        j = jdn + 32044
        g = cls._div(j, 146097)
        dg = j % 146097
        c = cls._div((cls._div(dg, 36524) + 1) * 3, 4)
        dc = dg - c * 36524
        b = cls._div(dc, 1461)
        db = dc % 1461
        a = cls._div((cls._div(db, 365) + 1) * 3, 4)
        da = db - a * 365
        y = g * 400 + c * 100 + b * 4 + a
        m = cls._div(5 * da + 308, 153) - 2
        d = da - cls._div(153 * (m + 2) + 2, 5) + 1
        y = y - 4800 + cls._div(m + 2, 12)
        m = (m + 2) % 12 + 1
        return y, m, d

    @classmethod
    def _j2d(cls, jy, jm, jd):
        gy, march = cls._jal_cal(jy)
        return cls._g2d(gy, 3, march) + (jm - 1) * 31 - cls._div(jm, 7) * (jm - 7) + jd - 1

    @classmethod
    def _jalali_to_gregorian(cls, jy, jm, jd):
        return cls._d2g(cls._j2d(jy, jm, jd))


    @classmethod
    def _parse_date_any(cls, v) -> date:
        """
        ورودی: datetime/date/str (ISO یا جلالی، با ارقام فارسی/عربی/انگلیسی)
        خروجی: date میلادی
        """
        if isinstance(v, date) and not isinstance(v, datetime):
            return v
        if isinstance(v, datetime):
            return v.date()

        s = cls._fa2en(str(v or "").strip())
        if not s:
            raise ValueError("empty date")

        # 1) ISO YYYY-MM-DD
        try:
            return date.fromisoformat(s[:10])
        except Exception:
            pass

        # 2) YYYY/MM/DD (جلالی یا میلادی با اسلش)
        t = s.replace("-", "/")
        parts = t.split("/")
        if len(parts) >= 3 and all(p.isdigit() for p in parts[:3]):
            y, m, d = map(int, parts[:3])
            if y < 1700:  # ← فقط سال‌های کوچک‌تر از 1700 را جلالی بگیر
                gy, gm, gd = cls._jalali_to_gregorian(y, m, d)
                return date(gy, gm, gd)
            else:
                return date(y, m, d)  # میلادی با اسلش

        raise ValueError(f"bad date format: {v}")

    @transaction.atomic
    def post(self, request, public_id):
        user = request.user
        player = getattr(user, "userprofile", None) or getattr(user, "profile", None)
        if not player:
            return Response({"detail": "پروفایل بازیکن یافت نشد."}, status=400)

        comp = get_object_or_404(PoomsaeCompetition, public_id=public_id)

        # --- 1) ثبت‌نام باز و داخل بازه
        today = timezone.localdate()
        if not getattr(comp, "registration_open", False):
            return Response({"detail": "ثبت‌نام این مسابقه فعال نیست."}, status=400)
        rs = getattr(comp, "registration_start", None)
        re_ = getattr(comp, "registration_end", None)
        if rs and re_ and not (rs <= today <= re_):
            return Response({"detail": "خارج از بازهٔ ثبت‌نام هستید."}, status=400)

        # --- 2) جلوگیری از ثبت‌نام تکراری (با قفل)
        if PoomsaeEntry.objects.select_for_update().filter(competition=comp, player=player).exists():
            return Response({"detail": "قبلاً برای این مسابقه ثبت‌نام کرده‌اید."}, status=400)

        # --- 3) کد تأیید مربی (الزامی و فقط مربی خود بازیکن)
        coach_code = (request.data.get("coach_code") or "").strip()
        if not coach_code:
            return Response({"coach_code": ["کد تأیید مربی الزامی است."]}, status=400)

        player_coach = getattr(player, "coach", None)
        if not player_coach:
            return Response({"detail": "ابتدا مربی شما باید در پروفایل ثبت شود."}, status=400)

        # فقط کد تأیید مربیِ همین بازیکن برای همین مسابقه قابل قبول است
        appr = PoomsaeCoachApproval.objects.filter(
            competition=comp,
            coach=player_coach,
            is_active=True,
            terms_accepted=True,
        ).first()

        if not appr or appr.code != coach_code:
            return Response({"coach_code": ["کد تأیید مربی نامعتبر است."]}, status=400)

        coach = player_coach  # مربیِ معتبر خودِ بازیکن

        # --- 4) سایر فیلدهای ورودی
        ins_num = (request.data.get("insurance_number") or "").strip()
        ins_date_s = (request.data.get("insurance_issue_date") or "").strip()

        if not ins_num:
            return Response({"insurance_number": ["شماره بیمه الزامی است."]}, status=400)
        if not ins_date_s:
            return Response({"insurance_issue_date": ["تاریخ صدور الزامی است."]}, status=400)

        # تاریخ صدور بیمه (جلالی/میلادی)
        try:
            ins_date = self._parse_date_any(ins_date_s)  # از همین کلاس
        except Exception:
            return Response(
                {"insurance_issue_date": ["فرمت تاریخ نامعتبر است. (مثلاً ۱۴۰۳/۰۵/۲۰ یا 2025-09-01)"]},
                status=400
            )

        # تاریخ برگزاری
        comp_day = (comp.competition_date.date()
                    if isinstance(comp.competition_date, datetime)
                    else comp.competition_date)
        if not comp_day:
            return Response({"detail": "تاریخ برگزاری مسابقه تنظیم نشده است."}, status=400)

        # قواعد بیمه
        if ins_date > (comp_day - timedelta(days=3)):
            return Response({"insurance_issue_date": ["تاریخ صدور باید حداقل ۷۲ ساعت قبل از روز برگزاری باشد."]},
                            status=400)
        if ins_date < (comp_day - timedelta(days=365)):
            return Response({"insurance_issue_date": ["اعتبار بیمه منقضی است (بیش از یک سال قبل از مسابقه)."]},
                            status=400)

        # --- 5) تاریخ تولد بازیکن
        birth_raw = getattr(player, "birth_date", None)
        if not birth_raw:
            return Response({"detail": "تاریخ تولد در پروفایل ثبت نشده است."}, status=400)
        try:
            birth_dt = self._parse_date_any(birth_raw)  # از همین کلاس
        except Exception:
            return Response({"detail": "تاریخ تولد در پروفایل نامعتبر است."}, status=400)

        # --- 6) رده سنی/کمربند/دیویژن
        age_cat = comp.age_categories.filter(
            from_date__lte=birth_dt, to_date__gte=birth_dt
        ).order_by("from_date").first()
        if not age_cat:
            return Response({"detail": "با تاریخ تولد شما ردهٔ سنیِ مجاز در این مسابقه یافت نشد."}, status=400)

        belt = None
        if hasattr(player, "belt_id") and player.belt_id:
            belt = Belt.objects.filter(id=player.belt_id).first()
        elif hasattr(player, "belt") and isinstance(getattr(player, "belt"), Belt):
            belt = player.belt
        elif hasattr(player, "belt") and isinstance(getattr(player, "belt"), str):
            belt = Belt.objects.filter(name__iexact=player.belt).first() or \
                   Belt.objects.filter(label__iexact=player.belt).first()
        if not belt:
            return Response({"detail": "کمربند بازیکن در پروفایل مشخص نیست."}, status=400)

        req_gender = _gender_norm(getattr(comp, "gender", None))
        player_gender = _gender_norm(getattr(player, "gender", None))
        if req_gender not in ("male", "female"):
            return Response({"detail": "جنسیت مسابقه به‌درستی تنظیم نشده است."}, status=400)
        if player_gender != req_gender:
            return Response({"detail": "جنسیت بازیکن با مسابقه سازگار نیست."}, status=400)

        division = PoomsaeDivision.objects.filter(
            competition=comp,
            gender=req_gender,
            age_category=age_cat,
            belt=belt
        ).first()
        if not division:
            return Response({"detail": "برای ترکیب رده‌سنی/کمربند شما دیویژنی تعریف نشده است."}, status=400)

        # --- 7) ساخت Entry (coach، همان مربی خود بازیکن)
        entry_kwargs = dict(competition=comp, player=player, division=division)
        if hasattr(PoomsaeEntry, "coach"):
            entry_kwargs["coach"] = coach

        entry = PoomsaeEntry.objects.create(**entry_kwargs)

        if hasattr(entry, "insurance_number"):
            entry.insurance_number = ins_num
        if hasattr(entry, "insurance_issue_date"):
            entry.insurance_issue_date = ins_date
        try:
            entry.save()
        except Exception:
            pass

        return Response({"enrollment_id": entry.id, "status": "pending_payment"}, status=status.HTTP_201_CREATED)
class PoomsaeSelfPrefillView(APIView):
    """
    پیش‌پر کردن فرم ثبت‌نام خودی پومسه.
    locked.birth_date            → ۱۳۷۲/۰۱/۱۵ (فارسی؛ مناسب نمایش)
    locked.birthDate             → همان بالا (camelCase)
    locked.birth_date_jalali     → 1372/01/15  (لاتین)
    locked.birth_date_jalali_fa  → ۱۳۷۲/۰۱/۱۵  (فارسی)
    locked.birth_date_iso        → 1993-04-04  (میلادی ISO)
    """
    permission_classes = [IsAuthenticated]
    authentication_classes = [JWTAuthentication]

    _RTL = r"[\u200e\u200f\u202a-\u202e\u2066-\u2069\u200c]"
    _DIGMAP_FA2EN = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
    _DIGMAP_EN2FA = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")

    # ---------- digit/rtl helpers ----------
    @staticmethod
    def _strip_rtl(s: str) -> str:
        return re.sub(PoomsaeSelfPrefillView._RTL, "", str(s or ""))

    @staticmethod
    def _fa2en(s: str) -> str:
        return str(s or "").translate(PoomsaeSelfPrefillView._DIGMAP_FA2EN)

    @staticmethod
    def _en2fa(s: str) -> str:
        return str(s or "").translate(PoomsaeSelfPrefillView._DIGMAP_EN2FA)

    # ---------- date helpers ----------
    @staticmethod
    def _to_jalali(g: date | None):
        """ورودی date میلادی → (jalali_en, jalali_fa) به شکل 'YYYY/MM/DD'."""
        if not g:
            return None, None
        try:
            j = jdatetime.date.fromgregorian(date=g).strftime("%Y/%m/%d")
            return j, PoomsaeSelfPrefillView._en2fa(j)
        except Exception:
            return None, None

    @classmethod
    def _parse_any_to_gregorian(cls, v) -> date | None:
        """
        datetime/date/str (ISO یا جلالی، با ارقام فارسی/عربی/انگلیسی) → date میلادی.
        شامل «ترمیم سال سه‌رقمی» برای مواردی مثل ۷۷۷/۰۱/۱۵ تا به ۱۳۷۷/۰۱/۱۵ نگاشت شود.
        """
        if isinstance(v, date) and not isinstance(v, datetime):
            return v
        if isinstance(v, datetime):
            return v.date()

        s = cls._fa2en(cls._strip_rtl(v)).strip()
        if not s:
            return None
        s = s.split("T", 1)[0]  # cut time

        # ISO
        try:
            return date.fromisoformat(s[:10].replace("/", "-"))
        except Exception:
            pass

        # جلالی یا میلادی با اسلش/نقطه
        t = s.replace("-", "/")
        m = re.match(r"^\s*(\d{3,4})[\/\.](\d{1,2})[\/\.](\d{1,2})", t)
        if not m:
            return None
        y, mo, d = map(int, m.groups())

        # --- Heuristic: repair truncated Jalali years into 1300–1500 if possible ---
        if y < 1700:  # احتمالاً جلالی
            if 100 <= y <= 999:
                cand1 = y + 600   # 777 -> 1377
                cand2 = y + 1000  # 385 -> 1385
                if 1300 <= cand1 <= 1500:
                    y = cand1
                elif 1300 <= cand2 <= 1500:
                    y = cand2
            try:
                g = jdatetime.date(y, mo, d).togregorian()
                return date(g.year, g.month, g.day)
            except Exception:
                return None

        # Gregorian with slashes/dots
        try:
            return date(y, mo, d)
        except Exception:
            return None

    @staticmethod
    def _find_birth_source(player, user=None):
        for n in ["birth_date", "birthDate", "date_of_birth", "dob", "birth", "birthday"]:
            v = getattr(player, n, None)
            if v:
                return v
        if user:
            for n in ["birth_date", "birthDate", "date_of_birth", "dob", "birth", "birthday"]:
                v = getattr(user, n, None)
                if v:
                    return v
        return None

    # ---------- display helpers ----------
    @staticmethod
    def _belt_display(player):
        if hasattr(player, "belt"):
            b = getattr(player, "belt")
            if isinstance(b, str):
                return b
            if b:
                return getattr(b, "name", None) or getattr(b, "label", None) or str(b)
        for alt in ("belt_name", "belt_label", "belt_title", "belt_grade"):
            v = getattr(player, alt, None)
            if v:
                return str(v)
        return None

    @staticmethod
    def _club_display(player):
        c = getattr(player, "club", None)
        if not c:
            return None
        return getattr(c, "title", None) or getattr(c, "club_name", None) or getattr(c, "name", None) or str(c)

    @staticmethod
    def _coach_display(player):
        coach = getattr(player, "coach", None)
        if not coach:
            raw = getattr(player, "coach_name", None)
            if not raw:
                return None
            t = PoomsaeSelfPrefillView._fa2en(PoomsaeSelfPrefillView._strip_rtl(raw))
            t2 = re.sub(r"[\s\-–—:|،]*[+(\[]?\d[\d\s\-\(\)]{6,}$", "", t).strip()
            return t2 if t2 else str(raw)
        if hasattr(coach, "get_full_name"):
            fn = coach.get_full_name()
            if fn:
                return fn
        fn = f"{getattr(coach, 'first_name', '')} {getattr(coach, 'last_name', '')}".strip()
        return fn or getattr(coach, "name", None) or getattr(coach, "full_name", None) or str(coach)

    @staticmethod
    def _national_id(player):
        for f in ("national_id", "national_code", "melli_code", "code_melli"):
            v = getattr(player, f, None)
            if v:
                return str(v)
        return None

    # ---------- GET ----------
    def get(self, request, public_id):
        comp = get_object_or_404(PoomsaeCompetition, public_id=public_id)
        user = request.user
        player = getattr(user, "userprofile", None) or getattr(user, "profile", None)

        locked = None
        suggested = {}

        if player:
            belt_name  = self._belt_display(player)
            club_name  = self._club_display(player)
            coach_name = self._coach_display(player)
            nid        = self._national_id(player)

            birth_src  = self._find_birth_source(player, user)
            birth_greg = self._parse_any_to_gregorian(birth_src)
            birth_j_en, birth_j_fa = self._to_jalali(birth_greg)

            locked = {
                "first_name": getattr(player, "first_name", None) or getattr(user, "first_name", None),
                "last_name":  getattr(player, "last_name",  None) or getattr(user, "last_name",  None),
                "national_id": nid,

                # نمایش اصلی فرم (شمسی با ارقام فارسی)
                "birth_date": birth_j_fa,
                "birthDate":  birth_j_fa,  # camelCase

                # کلیدهای تکمیلی
                "birth_date_iso":        birth_greg.isoformat() if birth_greg else None,
                "birth_date_jalali":     birth_j_en,
                "birth_date_jalali_fa":  birth_j_fa,

                "belt":  belt_name,
                "club":  club_name,
                "coach": coach_name,
            }

            ins = getattr(player, "insurance_number", None)
            if ins:
                suggested["insurance_number"] = str(ins)

        return Response({
            "can_register": True,
            "need_coach_code": bool(getattr(comp, "coach_approval_required", False)),
            "locked": locked,
            "suggested": suggested,
        })


class PoomsaeEnrollmentsGroupedView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, public_id):
        comp = PoomsaeCompetition.objects.filter(public_id=public_id).first()
        if not comp:
            return Response({"detail": "مسابقه یافت نشد."}, status=status.HTTP_404_NOT_FOUND)

        qs = (
            PoomsaeEntry.objects.filter(competition=comp)
            .select_related("player", "division__belt", "division__age_category")
            .order_by(
                "player__birth_date",
                "division__belt__name",
                "player__last_name", "player__first_name",
            )
        )
        items = EnrollmentLiteSerializer(qs, many=True, context={"request": request}).data

        # گروه‌بندی: age_category (از خود مسابقه) → belt_group
        grouped = defaultdict(lambda: defaultdict(list))
        age_title = getattr(getattr(comp, "age_category", None), "name", "بدون گروه سنی")
        for it in items:
            bg = it.get("belt_group_label") or "نامشخص"
            grouped[age_title][bg].append(it)

        # خروجی نهایی
        out = []
        for age_name, belts in grouped.items():
            belt_list = []
            for belt_name, people in belts.items():
                belt_list.append({"belt_group": belt_name, "enrollments": people})
            out.append({"age_group": age_name, "by_belt": belt_list})

        return Response({"groups": out})
