# ---------- کارت ثبت‌نام (فقط پس از پردا
from datetime import timedelta, date as date_cls
import jdatetime
from django.db.models import Prefetch
from rest_framework.decorators import api_view, permission_classes
from datetime import date as _date, timedelta
from django.db.models import Q
from django.utils import timezone
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny
from rest_framework.permissions import IsAuthenticated

from django.db import transaction
from .serializers import CompetitionRegistrationSerializer
from .permissions import IsPlayer
from django.shortcuts import get_object_or_404
import re
from rest_framework import views, permissions, status,generics
from rest_framework.response import Response
from rest_framework.views import APIView
from datetime import timedelta

from django.utils.timezone import now
from django.http import Http404
from rest_framework_simplejwt.authentication import JWTAuthentication
import re
from django.conf import settings
from accounts.models import UserProfile, TkdClub, TkdBoard
from .models import (KyorugiCompetition, CoachApproval, Enrollment,  Draw,  Match, WeightCategory, BeltGroup,
                     Belt,KyorugiResult,Seminar, SeminarRegistration,Seminar)
from .permissions import IsCoach, IsPlayer
from .serializers import (
    KyorugiCompetitionDetailSerializer,
    CompetitionRegistrationSerializer,
    DashboardKyorugiCompetitionSerializer,
    EnrollmentCardSerializer,KyorugiBracketSerializer,
    SeminarSerializer, SeminarRegistrationSerializer,SeminarCardSerializer
)


CARD_READY_STATUSES = {"paid", "confirmed", "approved", "accepted", "completed"}

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
    """
    دریافت مسابقه با public_id
    فقط رشته‌های 10 تا 16 کاراکتری [a-z0-9] را قبول می‌کند.
    """
    if not re.fullmatch(r"[a-z0-9]{10,16}", str(key)):
        raise Http404
    return get_object_or_404(KyorugiCompetition, public_id=str(key))


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
        player = UserProfile.objects.filter(
            user=request.user, role__in=["player", "both"]
        ).first()
        if not player:
            return Response({"detail": "پروفایل بازیکن یافت نشد."},
                            status=status.HTTP_404_NOT_FOUND)

        # 3) جلوگیری از ثبت‌نام تکراری (لغوشده‌ها استثناء هستند؛ اگر نمی‌خواهید، exclude را بردارید)
        existing_qs = Enrollment.objects.filter(
            competition=comp, player=player
        ).exclude(status="canceled")

        if existing_qs.exists():
            exist = existing_qs.order_by("-id").first()
            return Response(
                {
                    "detail": "شما قبلاً برای این مسابقه ثبت‌نام کرده‌اید.",
                    "enrollment_id": exist.id,
                    "status": exist.status,
                },
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
        ser = CompetitionRegistrationSerializer(
            data=payload,
            context={"request": request, "competition": comp}
        )
        ser.is_valid(raise_exception=True)

        enrollment = ser.save()  # Enrollment ساخته می‌شود

        # 6) پرداخت آزمایشی (یا رایگان) — مثل قبل
        simulate_paid = (not getattr(settings, "PAYMENTS_ENABLED", False)) or (comp.entry_fee == 0)
        if simulate_paid:
            ref = f"TEST-{enrollment.id:06d}"
            enrollment.mark_paid(amount=comp.entry_fee or 0, ref_code=ref)
            out = CompetitionRegistrationSerializer(enrollment, context={"request": request}).data
            return Response(
                {
                    "detail": "ثبت‌نام انجام شد و پرداخت آزمایشی موفق بود.",
                    "data": out,
                    "enrollment_id": enrollment.id,
                    "status": enrollment.status,
                },
                status=status.HTTP_201_CREATED
            )

        # 7) مسیر واقعی پرداخت (وقتی درگاه داشتید)
        # intent = PaymentIntent.objects.create(...)
        # enrollment.payment_intent = intent
        # enrollment.save(update_fields=["payment_intent"])
        # return Response(
        #     {
        #         "detail": "ثبت‌نام انجام شد. شما به درگاه پرداخت هدایت می‌شوید.",
        #         "data": {"enrollment_id": enrollment.id, "status": enrollment.status},
        #         "payment_url": intent.get_redirect_url(),
        #     },
        #     status=status.HTTP_201_CREATED
        # )
# ---------- وضعیت/تأیید مربی ----------
class CoachApprovalStatusView(views.APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [permissions.IsAuthenticated, IsCoach]

    def get(self, request, key):
        comp = _get_comp_by_key(key)

        coach = UserProfile.objects.filter(user=request.user, role__in=["coach", "both"]).first()
        if not coach:
            return Response({"detail": "پروفایل مربی یافت نشد."}, status=status.HTTP_404_NOT_FOUND)

        coach_name = f"{coach.first_name} {coach.last_name}".strip()

        club_names = set()
        if getattr(coach, "club", None) and getattr(coach.club, "club_name", None):
            club_names.add(coach.club.club_name)

        # اگر مدل TkdClub رابطهٔ M2M به نام coaches داشته باشد
        if hasattr(TkdClub, "coaches"):
            club_names.update(
                TkdClub.objects.filter(coaches=coach).values_list("club_name", flat=True)
            )

        # اگر فهرست اسامی باشگاه‌ها در پروفایل ذخیره می‌کنی
        if isinstance(getattr(coach, "club_names", None), list):
            club_names.update([c for c in coach.club_names if c])

        approval = CoachApproval.objects.filter(competition=comp, coach=coach).first()
        return Response({
            "competition": {"public_id": comp.public_id, "title": comp.title},
            "approved": bool(approval and approval.terms_accepted and approval.is_active),
            "code": approval.code if approval and approval.is_active else None,
            "coach_name": coach_name,
            "club_names": [c for c in club_names if c],
        }, status=status.HTTP_200_OK)


# ---------- تأیید مسابقه و دریافت/تولید کد ----------
# ---------- تأیید مسابقه و دریافت/تولید کد ----------
class ApproveCompetitionView(views.APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [permissions.IsAuthenticated, IsCoach]

    def post(self, request, key):
        comp = _get_comp_by_key(key)
        if not comp.registration_open:
            return Response({"detail": "ثبت‌نام این مسابقه فعال نیست."}, status=status.HTTP_400_BAD_REQUEST)

        coach = UserProfile.objects.filter(user=request.user, role__in=["coach", "both"]).first()
        if not coach:
            return Response({"detail": "پروفایل مربی یافت نشد."}, status=status.HTTP_404_NOT_FOUND)

        approval, created = CoachApproval.objects.get_or_create(
            competition=comp, coach=coach,
            defaults={"terms_accepted": True, "is_active": True}
        )

        # کد را همیشه از مدل بخواه: اگر قبلاً دارد برمی‌گرداند؛ اگر ندارد می‌سازد و ذخیره می‌کند
        code = approval.set_fresh_code(save=True, force=False)
        approval.code = code  # برای هم‌سنخ‌سازی آبجکت در حافظه

        if not approval.approved_at:
            approval.approved_at = now()
        approval.terms_accepted = True
        approval.is_active = True

        # نکته: 'code' را در update_fields نگذار تا با مقدار None قبلی رونویسی نشود
        approval.save(update_fields=["terms_accepted", "is_active", "approved_at"])

        return Response({"code": code}, status=status.HTTP_200_OK)

# ---------- لیست مسابقات قابل ثبت‌نام برای بازیکن ----------
class PlayerCompetitionsList(views.APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [permissions.IsAuthenticated, IsPlayer]

    def get(self, request):
        player = UserProfile.objects.filter(user=request.user, role__in=["player", "both"]).first()
        if not player or not player.coach:
            return Response([], status=status.HTTP_200_OK)

        today = now().date()
        qs = (
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
        return Response(
            [{"public_id": c.public_id, "title": c.title} for c in qs],
            status=status.HTTP_200_OK
        )


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


# ---------- لیست داشبورد ----------
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
        scope = request.query_params.get("scope", "").lower()
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
            # ✅ club / heyat / board / ناشناس: همه مسابقات (فقط مشاهده)
            if only_open:
                today = now().date()
                qs = qs.filter(
                    registration_open=True,
                    registration_start__lte=today,
                    registration_end__gte=today,
                )

            # اگر عمداً همه را خواستی (مثلاً برای coach هم)، با ?scope=all بی‌فیلتر بماند
            # (نیازی به کد اضافه نیست؛ qs از قبل all است)

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

        # منطق باز/بسته بودن پنجره ثبت‌نام (هماهنگ با detail)
        today = now().date()
        if comp.registration_start and comp.registration_end:
            in_window = comp.registration_start <= today <= comp.registration_end
        else:
            in_window = bool(comp.registration_open)
        can_register = bool(comp.registration_open and in_window)

        # نام مربی
        coach_name = ""
        if getattr(prof, "coach", None):
            coach_name = f"{prof.coach.first_name or ''} {prof.coach.last_name or ''}".strip()
        elif getattr(prof, "coach_name", ""):
            coach_name = prof.coach_name

        # نام باشگاه
        club_name = ""
        if getattr(prof, "club", None):
            club_name = getattr(prof.club, "club_name", "") or ""
        elif isinstance(getattr(prof, "club_names", None), list) and prof.club_names:
            club_name = "، ".join([c for c in prof.club_names if c])

        # کد ملی
        national = (
            getattr(prof, "national_code", "")
            or getattr(prof, "melli_code", "")
            or getattr(prof, "code_melli", "")
            or getattr(prof, "national_id", "")
        )

        data = {
            "competition": {"public_id": comp.public_id, "title": comp.title},
            "can_register": can_register,
            "locked": {
                "first_name": prof.first_name or getattr(request.user, "first_name", ""),
                "last_name": prof.last_name or getattr(request.user, "last_name", ""),
                "national_code": national,
                "national_id": national,
                "birth_date": getattr(prof, "birth_date", ""),
                "belt": getattr(prof, "belt_grade", ""),
                "club": club_name,
                "coach": coach_name,
            },
            "suggested": {
                "weight": getattr(prof, "weight", None),
                "insurance_number": getattr(prof, "insurance_number", ""),
                "insurance_issue_date": getattr(prof, "insurance_issue_date", ""),
            },
            "need_coach_code": str(getattr(prof, "role", "")) in ["player", "both"],
        }
        return Response(data, status=status.HTTP_200_OK)



class EnrollmentCardView(views.APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, enrollment_id: int):
        # 1) بدون شرط مالکیت، رکورد را بگیر
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
            if prof and prof.is_coach and enrollment.coach_id == prof.id:
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

        player = UserProfile.objects.filter(
            user=request.user, role__in=["player", "both"]
        ).first()
        if not player:
            return Response({"enrollment_id": None}, status=status.HTTP_200_OK)

        qs = Enrollment.objects.filter(competition=comp, player=player)

        # --- select_related امن بر اساس فیلدهای موجود در مدل اجرایی ---
        # بعضی دیتابیس‌ها هنوز فیلدهای belt_group/weight_category دارند،
        # بعضی دیگر division/division_weight
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

        can_show_card = e.status in {"paid", "confirmed", "approved", "accepted", "completed"}
        return Response({
            "enrollment_id": e.id,
            "status": e.status,
            "can_show_card": can_show_card,
        }, status=status.HTTP_200_OK)


class KyorugiBracketView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, key):
        comp = get_object_or_404(KyorugiCompetition, public_id=key)

        has_any_draw = comp.draws.exists()
        has_unnumbered_real_matches = Match.objects.filter(
            draw__competition=comp, is_bye=False, match_number__isnull=True
        ).exists()
        bracket_ready = has_any_draw and not has_unnumbered_real_matches

        if not bracket_ready:
            return Response({"detail": "bracket_not_ready"}, status=status.HTTP_404_NOT_FOUND)

        ser = KyorugiBracketSerializer(comp, context={"request": request})
        return Response(ser.data, status=status.HTTP_200_OK)

def _parse_jalali_ymd(s: str):
    """'1403/05/21' -> datetime.date (میلادی) یا None"""
    if not s:
        return None
    try:
        s = str(s).replace("-", "/").strip()
        y, m, d = [int(x) for x in s.split("/")]
        return jdatetime.date(y, m, d).togregorian()
    except Exception:
        return None

def _player_birthdate_to_gregorian(p: UserProfile):
    # birth_date در پروفایل رشته است (احتمالاً جلالی)
    return _parse_jalali_ymd(p.birth_date)

def _allowed_belt_names_for_comp(comp: KyorugiCompetition):
    # اگر گروه کمربندی تنظیم شده، از همان استفاده کن
    belts = set()
    if comp.belt_groups.exists():
        qs = BeltGroup.objects.filter(id__in=comp.belt_groups.values_list("id", flat=True)).prefetch_related("belts")
        for g in qs:
            belts.update(list(g.belts.values_list("name", flat=True)))
        return belts
    # در غیر اینصورت بر اساس belt_level
    if comp.belt_level == "all":
        return set(b[0] for b in UserProfile.BELT_CHOICES)
    yellow_to_blue = {"سفید","زرد","سبز","آبی"}  # اگر زرد تا آبی، این‌ها را می‌پذیریم
    red_black = {"قرمز"} | {f"مشکی دان {i}" for i in range(1, 11)}
    return yellow_to_blue if comp.belt_level == "yellow_blue" else red_black

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
    qs = (
        WeightCategory.objects
        .filter(id__in=ids, gender=gender)
        .order_by("min_weight")
    )
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
        coach = UserProfile.objects.filter(
            user=request.user, role__in=["coach", "both"], is_coach=True
        ).first()
        if not coach:
            return Response({"detail": "پروفایل مربی یافت نشد."}, status=status.HTTP_404_NOT_FOUND)

        items = request.data.get("items") or []
        if not isinstance(items, list) or not items:
            return Response({"detail": "فهرست انتخاب خالی است."}, status=status.HTTP_400_BAD_REQUEST)

        # پنجره ثبت‌نام
        today = now().date()
        if not (comp.registration_open and comp.registration_start <= today <= comp.registration_end):
            return Response({"detail": "ثبت‌نام این مسابقه فعال نیست یا خارج از بازه است."}, status=400)

        allowed_belts = _allowed_belt_names_for_comp(comp)
        gender = comp.gender  # male/female

        # بازیکنانی که از قبل ثبت‌نام شده‌اند (به‌جز لغوشده‌ها)
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

            # جلوگیری از تکرار
            if pid in already:
                skipped_already.append(pid)
                continue

            # شاگردِ همین مربی + جنسیت درست
            player = UserProfile.objects.filter(id=pid, role="player", gender=gender).first()
            if not player or player.coach_id != coach.id:
                errors[str(pid)] = "بازیکن معتبر نیست یا شاگرد شما نیست."
                continue

            # کمربند و رده‌سنی
            if player.belt_grade not in allowed_belts or not _age_ok_for_comp(player, comp):
                errors[str(pid)] = "شرایط کمربند/سن با مسابقه هم‌خوانی ندارد."
                continue

            # تاریخ بیمه (≥ ۷۲ ساعت قبل از مسابقه)
            ins_g = _parse_jalali_ymd(it.get("insurance_issue_date") or "")
            if not ins_g:
                errors[str(pid)] = "تاریخ صدور بیمه نامعتبر است."
                continue
            if comp.competition_date and ins_g > (comp.competition_date - timedelta(days=3)):
                errors[str(pid)] = "تاریخ صدور بیمه باید حداقل ۷۲ ساعت قبل از مسابقه باشد."
                continue

            # وزن اعلامی
            try:
                w = float(str(it.get("declared_weight")).replace(",", "."))
            except Exception:
                w = 0.0
            if w <= 0:
                errors[str(pid)] = "وزن اعلامی نامعتبر است."
                continue

            # ردهٔ وزنی مناسب
            wc = _find_weight_category_for(comp, gender, w)
            if not wc:
                errors[str(pid)] = "ردهٔ وزنی مناسب یافت نشد."
                continue

            # اسنپ‌شات‌های باشگاه/هیئت
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
                "enrollment_ids": [x["enrollment_id"] for x in out],  # ← اضافه شد
                "skipped_already_enrolled": skipped_already,
                "errors": errors,
            }, status=201)

        return Response({
            "detail": "ثبت‌نام ایجاد شد. پرداخت لازم است.",
            "total_amount": total_amount,
            "created_ids": [e.id for e in created],
            "enrollment_ids": [e.id for e in created],  # ← اضافه شد
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
                or (prof and prof.is_coach and e.coach_id == prof.id)
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
        return date_cls(y, m, d)   # ← به جای _date از date_cls استفاده کن
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

        # کمربندهای مجاز این مسابقه
        allowed_belts = _allowed_belt_names_for_comp(comp)
        gender = (comp.gender or "").lower()

        # شاگردهای مستقیم این مربی با جنسیت درست
        students_qs = (
            UserProfile.objects
            .filter(coach=coach, role__in=["player", "both"], gender=gender)
            .select_related("club", "tkd_board")
            .only(
                "id", "first_name", "last_name", "national_code", "birth_date",
                "belt_grade", "gender", "club", "tkd_board"
            )
        )

        # پیدا کردن قبلاً ثبت‌نام‌شده‌ها (لغو‌شده‌ها حساب نشوند)
        ids = list(students_qs.values_list("id", flat=True))
        existing_map = dict(
            Enrollment.objects
            .filter(competition=comp, player_id__in=ids)
            .exclude(status="canceled")
            .values_list("player_id", "status")
        )

        items = []
        for s in students_qs:
            # فیلتر کمربند و رده سنی
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
                "belt_grade": s.belt_grade,      # برای نمایش
                "belt": s.belt_grade,            # سازگاری با فرانت
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
            "prechecked_ids": list(existing_map.keys()),   # ← این‌ها را در UI پیش‌تیک بزن و قفل کن
        }, status=status.HTTP_200_OK)

# ───────── POST: ثبت‌نام گروهی شاگردها با جلوگیری از تکرار ─────────
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
        # بازیکنانی که از قبل ثبت‌نام شده‌اند (به‌جز لغوشده‌ها)
        already = set(
            Enrollment.objects.filter(competition=comp, player_id__in=player_ids)
            .exclude(status="canceled")
            .values_list("player_id", flat=True)
        )

        created_ids, skipped_already, errors = [], [], {}

        # مجموعه اوزان مجاز برای مسابقه (با توجه به تخصیص زمین‌ها)
        allowed_weight_ids = comp.allowed_weight_ids()

        for it in items:
            pid = it.get("player_id")
            if not pid:
                continue
            pid = int(pid)

            # جلوگیری از ثبت‌نام تکراری
            if pid in already:
                skipped_already.append(pid)
                continue

            player = UserProfile.objects.filter(id=pid, role__in=["player", "both"]).first()
            if not player:
                errors[str(pid)] = "پروفایل بازیکن یافت نشد."
                continue

            # تاریخ صدور بیمه (حداقل ۷۲ ساعت قبل از مسابقه)
            raw_ins = (it.get("insurance_issue_date") or "").replace("-", "/")
            try:
                y, m, d = [int(x) for x in raw_ins.split("/")[:3]]
                ins_date = jdatetime.date(y, m, d).togregorian() if y < 1700 else _date(y, m, d)
            except Exception:
                errors[str(pid)] = "تاریخ صدور بیمه نامعتبر است."
                continue

            if comp.competition_date and ins_date > (comp.competition_date - timedelta(days=3)):
                errors[str(pid)] = "تاریخ صدور بیمه باید حداقل ۷۲ ساعت قبل از مسابقه باشد."
                continue

            # وزن اعلامی
            try:
                declared_weight = float(str(it.get("declared_weight")).replace(",", "."))
            except Exception:
                declared_weight = 0.0
            if declared_weight <= 0:
                errors[str(pid)] = "وزن اعلامی نامعتبر است."
                continue

            # گروه کمربندی بازیکن در میان گروه‌های مسابقه
            belt_group = None
            if comp.belt_groups.exists():
                belt_group = comp.belt_groups.filter(belts__name=player.belt_grade).first()

            # رده وزنی متناسب با وزن/جنسیت در این مسابقه
            weight_cat = None
            if allowed_weight_ids:
                weight_cat = WeightCategory.objects.filter(
                    id__in=allowed_weight_ids,
                    gender=(player.gender or "").lower(),
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

        # ✅ شبیه‌سازی پرداخت/رایگان → بلافاصله کارت آماده می‌شود
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
                "enrollment_ids": [x["enrollment_id"] for x in enrollments_out],  # ← کلید مورد انتظار فرانت
                "enrollments": enrollments_out,                                   # ← برای سازگاری بیشتر
                "skipped_already_enrolled": skipped_already,
                "errors": errors,
            }, status=status.HTTP_201_CREATED)

        # 🔁 حالت واقعی پرداخت (اگر درگاه داری، payment_url را اضافه کن)
        return Response({
            "detail": "ثبت‌نام ایجاد شد. پرداخت لازم است.",
            "amount": total_amount,
            "enrollment_ids": created_ids,   # ← اضافه شد برای سازگاری با فرانت
            "created_ids": created_ids,      # ← نگهداشت خروجی قبلی
            "skipped_already_enrolled": skipped_already,
            "errors": errors,
            # "payment_url": intent.get_redirect_url(),  # اگر داری
        }, status=status.HTTP_201_CREATED if created_ids else status.HTTP_200_OK)
class KyorugiResultsView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, key):
        comp = get_object_or_404(KyorugiCompetition, public_id=key)
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


#-------------------------------------------------------------سمینار----------------------------------------------------------------------------

# views.py


# صفحه‌بندی پیش‌فرض
class DefaultPagination(PageNumberPagination):
    page_size = 12
    page_size_query_param = "page_size"
    max_page_size = 100

# -----------------------------
# لیست عمومی سمینارها (فیلتر/جستجو/مرتب‌سازی)
# -----------------------------
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

        # ✅ فیلتر نقش به‌صورت Cross-DB (بدون contains روی JSONField)
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

# -----------------------------
# جزئیات سمینار بر اساس public_id از مسیر /seminars/<key>/
# -----------------------------
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

# -----------------------------
# ثبت‌نام کاربر (URL شامل key)
# -----------------------------

class SeminarRegisterView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, key):
        seminar = get_object_or_404(Seminar, public_id=key)
        roles = request.data.get("roles") or []

        # allowed role check ...
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

        # ---------- پرداخت (غیرفعال) ----------
        # اگر می‌خوای درگاه رو فعال کنی:
        # 1) آدرس کال‌بک رو بساز
        # 2) درخواست PaymentRequest بفرست (مثلاً زرین‌پال)
        # 3) payment_url رو به فرانت برگردون
        #
        # if seminar.fee and seminar.fee > 0:
        #     callback_url = request.build_absolute_uri(
        #         reverse("competitions:seminar-pay-callback", kwargs={"key": seminar.public_id})
        #     )
        #     # نمونه شروع تراکنش (زرین‌پال - صرفاً نمونه)
        #     payment = _zarinpal_request(
        #         merchant_id=settings.ZARINPAL_MERCHANT_ID,
        #         amount=int(seminar.fee),
        #         description=f"ثبت‌نام سمینار: {seminar.title}",
        #         callback_url=callback_url,
        #         email=getattr(request.user, "email", "") or "",
        #         mobile=getattr(request.user, "profile", None) and getattr(request.user.profile, "phone", "") or "",
        #     )
        #     if payment.get("status") == 100:  # کد موفق
        #         # می‌تونی authority رو روی reg ذخیره کنی برای Verify
        #         # reg.gateway_authority = payment["authority"]
        #         # reg.save(update_fields=["gateway_authority"])
        #         return Response({
        #             "status": "ok",
        #             "created": bool(created),
        #             "registration_id": getattr(reg, "id", None),
        #             "payment_required": True,
        #             "payment_url": payment["url"],  # کاربر باید به این آدرس هدایت شود
        #         }, status=200)
        # --------------------------------------

        # رفتار فعلی: بدون درگاه
        return Response({
            "status": "ok",
            "created": bool(created),
            "registration_id": getattr(reg, "id", None),
            "payment_required": False,
        }, status=200)


# ---------- پرداخت (غیرفعال) ----------
# نمونه فانکشن شروع تراکنش (زرین‌پال) — فقط نمونه، برای فعال‌سازی کامنت‌ها رو بردار
# import requests
# def _zarinpal_request(merchant_id, amount, description, callback_url, email="", mobile=""):
#     req_json = {
#         "merchant_id": merchant_id,
#         "amount": amount,
#         "description": description,
#         "callback_url": callback_url,
#         "metadata": {"email": email, "mobile": mobile}
#     }
#     r = requests.post("https://api.zarinpal.com/pg/v4/payment/request.json", json=req_json, timeout=10)
#     data = r.json()
#     if r.status_code == 200 and data.get("data") and data["data"].get("code") == 100:
#         authority = data["data"]["authority"]
#         return {
#             "status": 100,
#             "authority": authority,
#             "url": f"https://www.zarinpal.com/pg/StartPay/{authority}"
#         }
#     return {"status": -1}


# کال‌بک پرداخت (Verify) — کامنت، برای فعال‌سازی بازش کن
# class SeminarPayCallbackView(APIView):
#     permission_classes = [AllowAny]
#
#     def get(self, request, key):
#         # نمونه‌ی Verify برای زرین‌پال
#         authority = request.GET.get("Authority")
#         status_qs = request.GET.get("Status")  # OK | NOK
#         seminar = get_object_or_404(Seminar, public_id=key)
#         reg = SeminarRegistration.objects.filter(seminar=seminar, user__isnull=False).order_by("-id").first()
#         if not reg:
#             return Response({"detail": "ثبت‌نام یافت نشد."}, status=404)
#
#         if status_qs != "OK":
#             # پرداخت لغو شده
#             return Response({"detail": "پرداخت ناموفق/لغو شد."}, status=400)
#
#         # Verify
#         payload = {
#             "merchant_id": settings.ZARINPAL_MERCHANT_ID,
#             "amount": int(seminar.fee),
#             "authority": authority,
#         }
#         r = requests.post("https://api.zarinpal.com/pg/v4/payment/verify.json", json=payload, timeout=10)
#         data = r.json()
#         if r.status_code == 200 and data.get("data") and data["data"].get("code") == 100:
#             # موفق: علامت‌گذاری پرداخت
#             reg.mark_paid(amount=int(seminar.fee))
#             # اینجا می‌تونی ریدایرکت بشی به صفحه موفقیت فرانت:
#             # return redirect(f"{settings.FRONTEND_BASE_URL}/dashboard/<role>?section=courses&paid=1")
#             return Response({"status": "ok", "ref_id": data["data"].get("ref_id")}, status=200)
#         return Response({"detail": "تأیید پرداخت ناموفق بود."}, status=400)

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

