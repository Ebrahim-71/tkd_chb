from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import authenticate
from rest_framework.views import APIView
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
from django.db.models.functions import Concat
from .utils import send_verification_code  # 👈 یادت نره
from django.utils.timezone import now
from django.db.models.functions import Coalesce
from rest_framework_simplejwt.tokens import RefreshToken
from django.core.cache import cache
from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404, redirect
from django.contrib.admin.views.decorators import staff_member_required
from django.contrib import messages
from django.views.decorators.csrf import csrf_exempt

from django.urls import reverse

from datetime import timedelta
from rest_framework.permissions import AllowAny
import random
from django.db.models import  Sum,Count, Q, F,Subquery, OuterRef, IntegerField, Value, CharField
from rest_framework.parsers import MultiPartParser, FormParser
from django.http import JsonResponse
import json
from competitions.models import KyorugiCompetition, CoachApproval,Enrollment
from .models import SMSVerification, UserProfile, TkdBoard, TkdClub, PendingUserProfile, PendingCoach, PendingClub, \
    PendingEditProfile, CoachClubRequest
from .serializers import (PhoneSerializer, VerifyCodeSerializer,
                          PendingCoachSerializer, PendingPlayerSerializer,
                          PendingClubSerializer, VerifyLoginCodeSerializer,
                          PlayerDashboardSerializer, UserProfileSerializer,
                          PendingEditProfileSerializer, ClubSerializer, ClubStudentSerializer
, ClubCoachInfoSerializer, CoachClubRequestSerializer,DashboardKyorugiCompetitionSerializer,
                          )

# accounts/views.py
from django.conf import settings


User = get_user_model()


class SendCodeAPIView(APIView):
    def post(self, request):
        role = request.data.get("role")
        serializer = PhoneSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        phone = serializer.validated_data['phone']
        role = request.data.get("role")

        # بررسی وجود شماره بر اساس نقش
        if role in ['player', 'coach']:
            if UserProfile.objects.filter(phone=phone).exists() or PendingUserProfile.objects.filter(
                    phone=phone).exists():
                return Response({"phone": "این شماره قبلاً ثبت شده است."}, status=status.HTTP_400_BAD_REQUEST)
        elif role == 'club':
            if TkdClub.objects.filter(founder_phone=phone).exists() or PendingClub.objects.filter(
                    founder_phone=phone).exists():
                return Response({"phone": "این شماره قبلاً ثبت شده است."}, status=status.HTTP_400_BAD_REQUEST)

        # بررسی ارسال کد در ۳ دقیقه گذشته
        recent = SMSVerification.objects.filter(
            phone=phone,
            created_at__gte=timezone.now() - timedelta(minutes=3)
        ).first()
        if role not in ['player', 'coach', 'club']:
            return Response({"error": "نقش نامعتبر است."}, status=status.HTTP_400_BAD_REQUEST)

        if recent:
            remaining = 180 - int((timezone.now() - recent.created_at).total_seconds())
            return Response({
                "error": "کد قبلی هنوز معتبر است.",
                "retry_after": remaining
            }, status=status.HTTP_429_TOO_MANY_REQUESTS)

        # ایجاد و ارسال کد جدید
        code = str(random.randint(1000, 9999))
        SMSVerification.objects.create(phone=phone, code=code)
        send_verification_code(phone, code)

        return Response({"message": "کد تأیید ارسال شد."}, status=status.HTTP_200_OK)


class LoginSendCodeAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PhoneSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        phone = serializer.validated_data['phone']
        role = serializer.validated_data['role']

        if role not in ['player', 'coach', 'referee', 'both', 'club']:
            return Response({"error": "نقش نامعتبر است."}, status=status.HTTP_400_BAD_REQUEST)

        exists = False
        if role == 'coach':  # یعنی مربی | داور
            exists = UserProfile.objects.filter(phone=phone, role__in=['coach', 'referee', 'both']).exists()
        elif role in ['player', 'referee', 'both']:
            exists = UserProfile.objects.filter(phone=phone, role=role).exists()
        elif role == 'club':
            exists = TkdClub.objects.filter(founder_phone=phone).exists()

        if not exists:
            return Response({"error": "کاربری با این شماره  یافت نشد."}, status=404)

        recent = SMSVerification.objects.filter(
            phone=phone,
            created_at__gte=timezone.now() - timedelta(minutes=3)
        ).first()

        if recent:
            remaining = 180 - int((timezone.now() - recent.created_at).total_seconds())
            return Response({
                "error": "کد قبلی هنوز معتبر است.",
                "retry_after": remaining
            }, status=429)

        code = str(random.randint(1000, 9999))
        SMSVerification.objects.create(phone=phone, code=code)
        send_verification_code(phone, code)

        return Response({"message": "کد ارسال شد."}, status=200)


# ------------------------------ ۲. تایید کد ------------------------------
class VerifyCodeAPIView(APIView):
    def post(self, request):
        serializer = VerifyCodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        phone = serializer.validated_data['phone']
        code = serializer.validated_data['code']
        expire_time = timezone.now() - timedelta(minutes=3)

        try:
            record = SMSVerification.objects.get(phone=phone, code=code)

            if record.created_at < expire_time:
                # اگر کد منقضی شده، پاکش کن
                record.delete()
                return Response({'error': 'کد منقضی شده است.'}, status=400)

            # اگر کد معتبر بود، پاکش کن
            record.delete()
            return Response({'message': 'کد تأیید شد. ادامه دهید.'})

        except SMSVerification.DoesNotExist:
            # چک می‌کنیم آیا کد قدیمی از همین شماره هست
            old_codes = SMSVerification.objects.filter(phone=phone)
            if old_codes.exists():
                old_codes.delete()  # پاکسازی احتیاطی

            return Response({'error': 'کد وارد شده نادرست است.'}, status=400)

class VerifyLoginCodeAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = VerifyLoginCodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        phone = serializer.validated_data['phone']
        code = serializer.validated_data['code']
        role = serializer.validated_data['role']

        # کد تأیید را پیدا کن
        try:
            sms = SMSVerification.objects.get(phone=phone, code=code)
        except SMSVerification.DoesNotExist:
            return Response({"error": "کد وارد شده نادرست است."}, status=400)

        # انقضا
        if sms.is_expired():
            sms.delete()
            return Response({"error": "کد منقضی شده است."}, status=400)

        # پروفایل/باشگاه را پیدا کن
        if role in ['coach', 'referee', 'both', 'player']:
            profile = UserProfile.objects.filter(
                phone=phone,
                role__in=['coach', 'referee', 'both', 'player']
            ).first()
        elif role == 'club':
            profile = TkdClub.objects.filter(founder_phone=phone).first()
        else:
            profile = None

        if not profile:
            return Response({"error": "کاربری با این اطلاعات یافت نشد."}, status=404)

        # --- تغییر اصلی از اینجا ---
        user = getattr(profile, "user", None)
        if user is None:
            from django.contrib.auth import get_user_model
            User = get_user_model()

            base_username = str(phone)
            username = base_username
            i = 1
            while User.objects.filter(username=username).exists():
                i += 1
                username = f"{base_username}_{i}"

            user = User.objects.create_user(username=username)
            user.set_unusable_password()
            user.save()

            # وصل‌کردن به مدل مربوط
            profile.user = user
            profile.save(update_fields=["user"])

        real_role = profile.role if isinstance(profile, UserProfile) else 'club'
        # --- تا اینجا ---

        # مصرف کد و ساخت توکن
        sms.delete()
        refresh = RefreshToken.for_user(user)
        return Response({
            "access": str(refresh.access_token),
            "role": real_role
        })


@api_view(['GET'])
def form_data_player_view(request):
    gender = request.GET.get('gender')

    heyats = list(TkdBoard.objects.values('id', 'name'))
    clubs = list(TkdClub.objects.values('id', 'club_name'))

    coaches_qs = UserProfile.objects.filter(is_coach=True)
    if gender:
        coaches_qs = coaches_qs.filter(gender=gender)

    coaches = [
        {"id": c.id, "full_name": f"{c.first_name} {c.last_name}"}
        for c in coaches_qs
    ]

    BELT_CHOICES = [('سفید', 'سفید'),
                    ('زرد', 'زرد'), ('سبز', 'سبز'), ('آبی', 'آبی'), ('قرمز', 'قرمز'),
                    *[(f'مشکی دان {i}', f'مشکی دان {i}') for i in range(1, 11)]
                    ]

    return Response({
        "heyats": heyats,
        "clubs": clubs,
        "coaches": coaches,
        "belt_choices": BELT_CHOICES,
    })


@api_view(['GET'])
def coaches_by_club_gender(request):
    club_id = request.GET.get('club')
    gender = request.GET.get('gender')

    coaches_qs = UserProfile.objects.filter(is_coach=True)

    if club_id:
        # فیلتر مربیان بر اساس باشگاه، فرض بر این است مربی‌ها به باشگاه مربوطند
        coaches_qs = coaches_qs.filter(coaching_clubs__id=club_id)

    if gender:
        coaches_qs = coaches_qs.filter(gender=gender)

    coaches = [
        {"id": c.id, "full_name": f"{c.first_name} {c.last_name}"}
        for c in coaches_qs
    ]

    return Response({"coaches": coaches})


@csrf_exempt
@api_view(['GET'])
def form_data_view(request):
    gender = request.GET.get('gender')

    heyats = list(TkdBoard.objects.values('id', 'name'))
    clubs = list(TkdClub.objects.values('id', 'club_name'))

    coaches_qs = UserProfile.objects.filter(is_coach=True)
    if gender:
        coaches_qs = coaches_qs.filter(gender=gender)

    coaches = [
        {"id": c.id, "full_name": f"{c.first_name} {c.last_name}"}
        for c in coaches_qs
    ]

    return Response({
        "heyats": heyats,
        "clubs": clubs,
        "coaches": coaches,
    })


ELIGIBLE_ENROLL_STATUSES = ('paid', 'confirmed', 'accepted', 'completed')

def annotate_student_stats(qs):
    enr = Enrollment.objects.filter(player_id=OuterRef('pk'),
                                    status__in=ELIGIBLE_ENROLL_STATUSES)

    # تعداد مسابقات منحصربه‌فرد
    enr_subq = (
        enr.order_by()
           .values('player_id')
           .annotate(c=Count('competition_id', distinct=True))
           .values('c')[:1]
    )

    zero_int = Value(0, output_field=IntegerField())

    return qs.annotate(
        competitions_count=Coalesce(Subquery(enr_subq, output_field=IntegerField()), zero_int),

        gold_total   = Coalesce(F('gold_medals'),          zero_int) +
                       Coalesce(F('gold_medals_country'),  zero_int) +
                       Coalesce(F('gold_medals_int'),      zero_int),

        silver_total = Coalesce(F('silver_medals'),        zero_int) +
                       Coalesce(F('silver_medals_country'),zero_int) +
                       Coalesce(F('silver_medals_int'),    zero_int),

        bronze_total = Coalesce(F('bronze_medals'),        zero_int) +
                       Coalesce(F('bronze_medals_country'),zero_int) +
                       Coalesce(F('bronze_medals_int'),    zero_int),
    )
def check_national_code(request):
    code = request.GET.get("code")
    if not code:
        return JsonResponse({"exists": False})

    exists = UserProfile.objects.filter(national_code=code).exists() or PendingUserProfile.objects.filter(
        national_code=code).exists()
    return JsonResponse({"exists": exists})


class RegisterCoachAPIView(APIView):
    parser_classes = [MultiPartParser, FormParser]
    permission_classes = [AllowAny]

    def post(self, request, format=None):
        data = request.data.copy()

        # تبدیل رشته JSON به دیکشنری برای refereeTypes
        referee_raw = data.get('refereeTypes')
        if referee_raw and isinstance(referee_raw, str):
            try:
                referee_types = json.loads(referee_raw)
                data['refereeTypes'] = referee_types
            except json.JSONDecodeError:
                referee_types = {}
                data['refereeTypes'] = {}
        else:
            referee_types = data.get('refereeTypes', {})

        # تبدیل selectedClubs به لیست
        clubs_raw = data.get('selectedClubs')
        if clubs_raw and isinstance(clubs_raw, str):
            try:
                data['selectedClubs'] = json.loads(clubs_raw)
            except json.JSONDecodeError:
                data['selectedClubs'] = []

        clubs = data.get('selectedClubs', [])

        # کپی درجه‌های مربیگری
        if data.get('coachGradeNational'):
            data['coach_level'] = data['coachGradeNational']
        if data.get('coachGradeIntl'):
            data['coach_level_International'] = data['coachGradeIntl']

        # تبدیل فیلدهای داوری
        for field in ['kyorogi', 'poomseh', 'hanmadang']:
            selected = referee_types.get(field, {}).get('selected', False)
            data[field] = selected
            if selected:
                data[f"{field}_level"] = referee_types[field].get('gradeNational')
                data[f"{field}_level_International"] = referee_types[field].get('gradeIntl')

        serializer_context = {'request': request}
        serializer = PendingCoachSerializer(data=data, context=serializer_context)

        if serializer.is_valid():
            instance = serializer.save()

            # ست‌کردن باشگاه‌ها (ManyToMany)
            if clubs:
                instance.coaching_clubs.set(clubs)
                club_names = TkdClub.objects.filter(id__in=clubs).values_list('club_name', flat=True)
                instance.club_names = list(club_names)

                try:
                    instance.club = TkdClub.objects.get(id=clubs[0])
                except TkdClub.DoesNotExist:
                    pass

            # مربی بالاسری
            coach_id = data.get('coach')
            if coach_id and coach_id != "other":
                try:
                    coach_instance = UserProfile.objects.get(id=int(coach_id))
                    if coach_instance.phone == instance.phone:
                        return Response({'status': 'error', 'message': 'مربی نمی‌تواند مربی خودش باشد.'}, status=400)
                    instance.coach = coach_instance
                    instance.coach_name = f"{coach_instance.first_name} {coach_instance.last_name}"
                except (UserProfile.DoesNotExist, ValueError):
                    return Response({'status': 'error', 'message': 'مربی انتخاب‌شده نامعتبر است'}, status=400)

            # نام هیئت
            instance.tkd_board_name = instance.tkd_board.name if instance.tkd_board else ''
            instance.save()

            return Response(
                {'status': 'ok', 'message': 'اطلاعات شما با موفقیت ثبت و در انتظار تأیید هیئت استان می‌باشد.'},
                status=200)

        return Response({'status': 'error', 'errors': serializer.errors}, status=400)


@staff_member_required
def approve_pending_user(request, pk):
    pending = get_object_or_404(PendingUserProfile, pk=pk)

    if UserProfile.objects.filter(national_code=pending.national_code).exists():
        messages.warning(request, "این کاربر قبلاً تأیید شده است.")
        return redirect(reverse("admin:accounts_userprofile_changelist"))

    is_coach = pending.role in ['coach', 'both']
    is_referee = pending.role in ['referee', 'both']

    # پیدا کردن مربی بالاسری در مدل اصلی UserProfile بر اساس coach_id موجود در PendingUserProfile
    coach_instance = None
    if pending.coach_id:
        try:
            coach_instance = UserProfile.objects.get(id=pending.coach_id)
        except UserProfile.DoesNotExist:
            coach_instance = None

    user_obj = User.objects.create_user(username=pending.phone)
    user_obj.set_unusable_password()
    user_obj.save()

    user = UserProfile.objects.create(
        first_name=pending.first_name,
        last_name=pending.last_name,
        father_name=pending.father_name,
        national_code=pending.national_code,
        birth_date=pending.birth_date,
        phone=pending.phone,
        gender=pending.gender,
        role=pending.role,
        province=pending.province,
        county=pending.county,
        city=pending.city,
        tkd_board=pending.tkd_board,
        tkd_board_name=pending.tkd_board.name if pending.tkd_board else '',
        address=pending.address,
        profile_image=pending.profile_image,
        belt_grade=pending.belt_grade,
        belt_certificate_number=pending.belt_certificate_number,
        belt_certificate_date=pending.belt_certificate_date,
        is_coach=is_coach,
        coach_level=pending.coach_level,
        coach_level_International=pending.coach_level_International,
        is_referee=is_referee,
        kyorogi=pending.kyorogi,
        kyorogi_level=pending.kyorogi_level,
        kyorogi_level_International=pending.kyorogi_level_International,
        poomseh=pending.poomseh,
        poomseh_level=pending.poomseh_level,
        poomseh_level_International=pending.poomseh_level_International,
        hanmadang=pending.hanmadang,
        hanmadang_level=pending.hanmadang_level,
        hanmadang_level_International=pending.hanmadang_level_International,
        confirm_info=pending.confirm_info,
        club_names=pending.club_names,
        coach_name=pending.coach_name,
        club=pending.club,
        coach=coach_instance,
        user=user_obj
    )

    user.coaching_clubs.set(pending.coaching_clubs.all())
    pending.delete()
    messages.success(request, "کاربر با موفقیت تأیید و منتقل شد.")
    return redirect(reverse("admin:accounts_userprofile_changelist"))


class RegisterPlayerAPIView(APIView):
    parser_classes = [MultiPartParser, FormParser]
    permission_classes = [AllowAny]

    def post(self, request, format=None):
        data = request.data.copy()

        # تبدیل JSON رشته‌ای به لیست آیدی باشگاه‌ها
        club_id = data.get('club')
        if club_id and club_id.isdigit():
            data['club'] = int(club_id)

        coach_id = data.get('coach')
        if coach_id and coach_id != "other":
            try:
                data['coach'] = int(coach_id)
            except ValueError:
                data['coach'] = None

        serializer = PendingPlayerSerializer(data=data, context={'request': request})
        if serializer.is_valid():
            instance = serializer.save()

            # افزودن نام هیئت
            if instance.tkd_board:
                instance.tkd_board_name = instance.tkd_board.name

            # افزودن نام باشگاه
            if instance.club:
                instance.club_names = [instance.club.club_name]

            if instance.coach:
                instance.coach_name = f"{instance.coach.first_name} {instance.coach.last_name}"

                instance.save()

            return Response(
                {'status': 'ok', 'message': 'اطلاعات شما با موفقیت ثبت و در انتظار تأیید هیئت استان میباشد.'},
                status=200)

        return Response({'status': 'error', 'errors': serializer.errors}, status=400)


class RegisterPendingClubAPIView(APIView):
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        data = request.data

        club_name = data.get('club_name')
        if club_name:
            if TkdClub.objects.filter(club_name=club_name).exists() or PendingClub.objects.filter(
                    club_name=club_name).exists():
                return Response(
                    {"status": "error", "errors": {"club_name": ["باشگاهی با این نام قبلاً ثبت شده است."]}},
                    status=status.HTTP_400_BAD_REQUEST
                )

        serializer = PendingClubSerializer(data=data)
        if not serializer.is_valid():
            return Response({"status": "error", "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        try:
            club_instance = serializer.save()

            # مقداردهی به نام هیئت
            if club_instance.tkd_board:
                club_instance.tkd_board_name = club_instance.tkd_board.name
                club_instance.save()

            return Response({"status": "ok", "message": "باشگاه ثبت شد و در انتظار تایید است."},
                            status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({"status": "error", "message": f"خطا در ذخیره‌سازی: {str(e)}"}, status=500)


@staff_member_required
def approve_pending_club(request, pk):
    pending = get_object_or_404(PendingClub, pk=pk)

    # بررسی تکراری نبودن باشگاه با شماره مجوز
    if TkdClub.objects.filter(license_number=pending.license_number).exists():
        messages.warning(request, "این باشگاه قبلاً ثبت و تایید شده است.")
        return redirect(reverse("admin:accounts_pendingclub_changelist"))

    user_obj = User.objects.create_user(username=pending.founder_phone)
    user_obj.set_unusable_password()
    user_obj.save()

    approved = TkdClub.objects.create(
        club_name=pending.club_name,
        founder_name=pending.founder_name,
        founder_national_code=pending.founder_national_code,
        founder_phone=pending.founder_phone,
        club_type=pending.club_type,
        activity_description=pending.activity_description,
        province=pending.province,
        county=pending.county,
        city=pending.city,
        tkd_board=pending.tkd_board,
        phone=pending.phone,
        address=pending.address,
        license_number=pending.license_number,
        federation_id=pending.federation_id,
        license_image=pending.license_image,
        confirm_info=pending.confirm_info,
        user=user_obj
    )

    pending.delete()
    messages.success(request, "باشگاه با موفقیت تایید و به لیست اصلی اضافه شد.")
    return redirect(reverse("admin:accounts_tkdclub_changelist"))


class ClubStudentsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        try:
            club = TkdClub.objects.get(user=user)
        except TkdClub.DoesNotExist:
            return Response({"detail": "باشگاه یافت نشد"}, status=404)

        students = UserProfile.objects.filter(club=club, role='player')

        coach = request.GET.get("coach")
        if coach and coach != "مربی":
            students = students.annotate(
                full_name=Concat('coach__first_name', Value(' '), 'coach__last_name', output_field=CharField())
            ).filter(full_name__icontains=coach)

        belt = request.GET.get("belt")
        if belt and belt != "درجه کمربند":
            students = students.filter(belt_grade=belt)

        birth_from = request.GET.get("birth_from")
        if birth_from:
            students = students.filter(birth_date__gte=birth_from)

        birth_to = request.GET.get("birth_to")
        if birth_to:
            students = students.filter(birth_date__lte=birth_to)

        # 🔍 جستجو در نام یا کد ملی
        search = request.GET.get("search")
        if search:
            students = students.filter(
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search) |
                Q(national_code__icontains=search)
            )
        students = annotate_student_stats(students)
        serialized = ClubStudentSerializer(students, many=True)
        return Response(serialized.data)


class ClubCoachesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            club = TkdClub.objects.get(user=request.user)
        except TkdClub.DoesNotExist:
            return Response({"detail": "باشگاه یافت نشد."}, status=404)

        # مربیانی که این باشگاه رو در coaching_clubs دارند
        coaches = UserProfile.objects.filter(coaching_clubs=club, is_coach=True)

        data = [
            {
                "id": coach.id,
                "name": f"{coach.first_name} {coach.last_name}"
            } for coach in coaches
        ]
        return Response(data)


class ClubAllCoachesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            club = TkdClub.objects.get(user=request.user)
        except TkdClub.DoesNotExist:
            return Response({"detail": "باشگاه یافت نشد."}, status=404)

        all_coaches = UserProfile.objects.filter(is_coach=True)

        # همه درخواست‌های pending مربوط به این باشگاه
        pending_requests = CoachClubRequest.objects.filter(
            club=club,
            status='pending'
        )

        # ساخت دیکشنری: {(coach_id, request_type): True}
        pending_map = {
            (req.coach_id, req.request_type): True
            for req in pending_requests
        }

        serializer = ClubCoachInfoSerializer(
            all_coaches,
            many=True,
            context={"club": club, "pending_map": pending_map}
        )

        # مرتب‌سازی: فعال‌ها (is_active=True) اول
        sorted_data = sorted(serializer.data, key=lambda x: not x['is_active'])

        return Response(sorted_data)

ELIGIBLE_ENROLL_STATUSES = ('paid', 'confirmed', 'accepted', 'completed')

def with_competitions_count(qs):
    subq = (
        Enrollment.objects
        .filter(player_id=OuterRef('pk'), status__in=ELIGIBLE_ENROLL_STATUSES)
        .values('player')
        .annotate(c=Count('id'))
        .values('c')[:1]
    )
    return qs.annotate(competitions_count=Subquery(subq, output_field=IntegerField()))

class DashboardCombinedView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, role):
        user = request.user

        if role == 'club':
            try:
                club = TkdClub.objects.get(user=user)
                members = UserProfile.objects.filter(club=club)

                student_count = members.filter(role='player').count()
                coach_count = UserProfile.objects.filter(
                    coaching_clubs=club, is_coach=True
                ).count()

                medals = members.aggregate(
                    gold_medals=Sum('gold_medals', default=0),
                    silver_medals=Sum('silver_medals', default=0),
                    bronze_medals=Sum('bronze_medals', default=0),
                    gold_medals_country=Sum('gold_medals_country', default=0),
                    silver_medals_country=Sum('silver_medals_country', default=0),
                    bronze_medals_country=Sum('bronze_medals_country', default=0),
                    gold_medals_int=Sum('gold_medals_int', default=0),
                    silver_medals_int=Sum('silver_medals_int', default=0),
                    bronze_medals_int=Sum('bronze_medals_int', default=0),
                )

                rankings = members.aggregate(
                    ranking_competition=Sum('ranking_competition', default=0),
                    ranking_total=Sum('ranking_total', default=0),
                )

                return Response({
                    "role": "club",
                    "club_name": club.club_name,
                    "founder_name": club.founder_name,
                    "student_count": student_count,
                    "coach_count": coach_count,
                    "matches_participated": club.matches_participated,
                    "gold_medals": medals["gold_medals"] or 0,
                    "silver_medals": medals["silver_medals"] or 0,
                    "bronze_medals": medals["bronze_medals"] or 0,
                    "gold_medals_country": medals["gold_medals_country"] or 0,
                    "silver_medals_country": medals["silver_medals_country"] or 0,
                    "bronze_medals_country": medals["bronze_medals_country"] or 0,
                    "gold_medals_int": medals["gold_medals_int"] or 0,
                    "silver_medals_int": medals["silver_medals_int"] or 0,
                    "bronze_medals_int": medals["bronze_medals_int"] or 0,
                    "ranking_competition": rankings["ranking_competition"] or 0,
                    "ranking_total": rankings["ranking_total"] or 0,
                })
            except TkdClub.DoesNotExist:
                return Response({"detail": "پروفایل باشگاه یافت نشد."}, status=404)

        elif role == 'heyat':
            try:
                board = TkdBoard.objects.get(user=user)
                members = UserProfile.objects.filter(tkd_board=board)

                student_count = members.filter(role='player').count()
                coach_count = members.filter(is_coach=True).count()
                referee_count = members.filter(is_referee=True).count()
                club_count = TkdClub.objects.filter(tkd_board=board).count()

                medals = members.aggregate(
                    gold_medals=Sum('gold_medals', default=0),
                    silver_medals=Sum('silver_medals', default=0),
                    bronze_medals=Sum('bronze_medals', default=0),
                    gold_medals_country=Sum('gold_medals_country', default=0),
                    silver_medals_country=Sum('silver_medals_country', default=0),
                    bronze_medals_country=Sum('bronze_medals_country', default=0),
                    gold_medals_int=Sum('gold_medals_int', default=0),
                    silver_medals_int=Sum('silver_medals_int', default=0),
                    bronze_medals_int=Sum('bronze_medals_int', default=0),
                )

                return Response({
                    "role": "heyat",
                    "board_name": board.name,
                    "student_count": student_count,
                    "coach_count": coach_count,
                    "referee_count": referee_count,
                    "club_count": club_count,
                    "gold_medals": medals["gold_medals"] or 0,
                    "silver_medals": medals["silver_medals"] or 0,
                    "bronze_medals": medals["bronze_medals"] or 0,
                    "gold_medals_country": medals["gold_medals_country"] or 0,
                    "silver_medals_country": medals["silver_medals_country"] or 0,
                    "bronze_medals_country": medals["bronze_medals_country"] or 0,
                    "gold_medals_int": medals["gold_medals_int"] or 0,
                    "silver_medals_int": medals["silver_medals_int"] or 0,
                    "bronze_medals_int": medals["bronze_medals_int"] or 0,
                })
            except TkdBoard.DoesNotExist:
                return Response({"detail": "هیئت مربوط به کاربر یافت نشد."}, status=404)

        # برای نقش‌های player / coach / referee / both
        try:
            profile = UserProfile.objects.get(user=user)
            serializer = PlayerDashboardSerializer(profile, context={"request": request})

            student_count = UserProfile.objects.filter(coach=profile).count() if profile.is_coach else 0
            coaching_clubs_count = profile.coaching_clubs.count() if profile.is_coach else 0

            return Response({
                **serializer.data,
                "student_count": student_count,
                "coaching_clubs_count": coaching_clubs_count,
            })

        except UserProfile.DoesNotExist:
            return Response({"detail": "پروفایل پیدا نشد."}, status=404)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def user_profile_with_form_data_view(request):
    try:
        user = request.user
        profile = user.profile
    except UserProfile.DoesNotExist:
        return Response({"detail": "پروفایل یافت نشد."}, status=404)

    # اطلاعات کاربر
    profile_serializer = UserProfileSerializer(profile, context={'request': request})

    # هیئت‌ها
    heyats = list(TkdBoard.objects.values('id', 'name'))

    # باشگاه‌ها
    clubs = list(TkdClub.objects.values('id', 'club_name'))

    # مربیان هم‌جنس
    gender = profile.gender
    coaches_qs = UserProfile.objects.filter(is_coach=True, gender=gender)
    coaches = [
        {"id": coach.id, "full_name": f"{coach.first_name} {coach.last_name}"}
        for coach in coaches_qs
    ]

    # درجات کمربند
    BELT_CHOICES = [
        ('زرد', 'زرد'), ('سبز', 'سبز'), ('آبی', 'آبی'), ('قرمز', 'قرمز'),
        *[(f'مشکی دان {i}', f'مشکی دان {i}') for i in range(1, 11)]
    ]

    # درجات مربی‌گری و داوری (از مدل)
    DEGREE_CHOICES = [
        ('درجه یک', 'درجه یک'), ('درجه دو', 'درجه دو'),
        ('درجه سه', 'درجه سه'), ('ممتاز', 'ممتاز')
    ]

    return Response({
        "profile": profile_serializer.data,
        "form_options": {
            "heyats": heyats,
            "clubs": clubs,
            "coaches": coaches,
            "belt_choices": BELT_CHOICES,
            "degree_choices": DEGREE_CHOICES,
        }
    })


class UpdateProfilePendingAPIView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        user = request.user
        try:
            original = user.profile
        except UserProfile.DoesNotExist:
            return Response({"error": "پروفایل یافت نشد."}, status=404)

        data = request.data.copy()

        # آماده‌سازی JSONها
        try:
            referee_raw = data.get('refereeTypes')
            if referee_raw and isinstance(referee_raw, str):
                data['refereeTypes'] = json.loads(referee_raw)
        except:
            data['refereeTypes'] = {}

        try:
            if isinstance(data.get('selectedClubs'), str):
                data['selectedClubs'] = json.loads(data['selectedClubs'])
        except:
            data['selectedClubs'] = []

        # تبدیل فیلدهای مربی‌گری
        if data.get('coachGradeNational'):
            data['coach_level'] = data['coachGradeNational']
        if data.get('coachGradeIntl'):
            data['coach_level_International'] = data['coachGradeIntl']

        # فیلدهای داوری
        referee_types = data.get('refereeTypes', {})
        for field in ['kyorogi', 'poomseh', 'hanmadang']:
            selected = referee_types.get(field, {}).get('selected', False)
            data[field] = bool(selected)
            if selected:
                data[f"{field}_level"] = referee_types[field].get('gradeNational') or None
                data[f"{field}_level_International"] = referee_types[field].get('gradeIntl') or None

        # ایجاد/آپدیت Pending
        existing = PendingEditProfile.objects.filter(original_user=original).first()
        serializer = PendingEditProfileSerializer(
            existing,
            data=data,
            context={'request': request},
        ) if existing else PendingEditProfileSerializer(data=data, context={'request': request})

        if not serializer.is_valid():
            return Response({'status': 'error', 'errors': serializer.errors}, status=400)

        pending = serializer.save(original_user=original)

        # مربی
        coach_id = data.get('coach')
        if coach_id and coach_id != "other":
            try:
                coach = UserProfile.objects.get(id=int(coach_id))
                if coach.phone == original.phone:
                    return Response({'status': 'error', 'message': 'مربی نمی‌تواند خودش باشد.'}, status=400)
                pending.coach = coach
                pending.coach_name = f"{coach.first_name} {coach.last_name}"
            except:
                pass

        # باشگاه‌ها
        club_names = []

        # مربی‌ها (selectedClubs)
        clubs = data.get('selectedClubs', [])
        if clubs:
            pending.coaching_clubs.set(clubs)
            club_names += list(
                TkdClub.objects.filter(id__in=clubs).values_list('club_name', flat=True)
            )

        # بازیکن (club)
        club_id = data.get('club')
        if club_id:
            try:
                pending.club = TkdClub.objects.get(id=int(club_id))
                if pending.club.club_name not in club_names:
                    club_names.append(pending.club.club_name)  # ⬅️ اضافه کردن اسم باشگاه بازیکن
            except:
                pass
        elif clubs:
            try:
                pending.club = TkdClub.objects.get(id=clubs[0])
            except:
                pass

        pending.club_names = club_names  # ✅ در نهایت ست کن

        # نقش
        if pending.is_coach and pending.is_referee:
            pending.role = 'both'
        elif pending.is_coach:
            pending.role = 'coach'
        elif pending.is_referee:
            pending.role = 'referee'
        else:
            pending.role = 'player'

        if pending.tkd_board:
            pending.tkd_board_name = pending.tkd_board.name

        pending.save()
        return Response({'status': 'ok', 'message': 'درخواست ویرایش شما ثبت و در انتظار تایید است.'}, status=200)


@staff_member_required
def approve_edited_profile(request, pk):
    pending = get_object_or_404(PendingEditProfile, pk=pk)
    user = pending.original_user

    if not user:
        messages.error(request, "پروفایل اصلی یافت نشد.")
        return redirect(reverse("admin:accounts_pendingeditprofile_changelist"))

    # ✅ لیستی از فیلدهایی که مستقیم باید منتقل بشن (و nullable نیستن)
    simple_fields = [
        'first_name', 'last_name', 'father_name', 'birth_date', 'gender',
        'address', 'province', 'county', 'city',
        'belt_grade', 'belt_certificate_number', 'belt_certificate_date',
        'coach_level', 'coach_level_International',
        'kyorogi', 'kyorogi_level', 'kyorogi_level_International',
        'poomseh', 'poomseh_level', 'poomseh_level_International',
        'hanmadang', 'hanmadang_level', 'hanmadang_level_International',
        'is_coach', 'is_referee', 'tkd_board_name', 'club_names', 'confirm_info', 'role'
    ]

    for field in simple_fields:
        setattr(user, field, getattr(pending, field))

    # ✅ فیلدهای ForeignKey
    if pending.tkd_board_id:
        user.tkd_board = pending.tkd_board

    if pending.coach_id:
        user.coach = pending.coach
        user.coach_name = pending.coach_name

    if pending.club_id:
        user.club = pending.club

    # ✅ اگر عکس جدید آپلود شده
    if pending.profile_image:
        user.profile_image = pending.profile_image

    # ✅ به‌روزرسانی باشگاه‌ها فقط اگر چیزی انتخاب شده باشه
    if pending.coaching_clubs.exists():
        user.coaching_clubs.set(pending.coaching_clubs.all())

    user.save()
    pending.delete()

    messages.success(request, "ویرایش کاربر با موفقیت تایید شد.")
    return redirect(reverse("admin:accounts_userprofile_changelist"))


class CoachStudentsAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        try:
            coach_profile = user.profile
        except UserProfile.DoesNotExist:
            return Response({"error": "پروفایل یافت نشد."}, status=404)

        if not coach_profile.is_coach:
            return Response({"error": "فقط مربیان به این بخش دسترسی دارند."}, status=403)

        students = UserProfile.objects.filter(coach=coach_profile, role="player")

        # فیلترها ...
        club = request.GET.get("club")
        if club and club != "باشگاه":
            students = students.filter(club__club_name=club)

        belt = request.GET.get("belt")
        if belt and belt != "درجه کمربند":
            students = students.filter(belt_grade=belt)

        birth_from = request.GET.get("birth_from")
        if birth_from:
            students = students.filter(birth_date__gte=birth_from)

        birth_to = request.GET.get("birth_to")
        if birth_to:
            students = students.filter(birth_date__lte=birth_to)

        search = request.GET.get("search")
        if search:
            students = students.filter(
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search) |
                Q(national_code__icontains=search)
            )

        students = annotate_student_stats(students)
        serialized = ClubStudentSerializer(students, many=True)
        return Response(serialized.data)


class CoachClubsAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            coach = request.user.profile
            if not coach.is_coach:
                return Response({"error": "شما مربی نیستید."}, status=403)

            clubs = coach.coaching_clubs.all()
            return Response(ClubSerializer(clubs, many=True).data)
        except:
            return Response({"error": "خطا در دریافت باشگاه‌ها"}, status=400)


class AllClubsAPIView(APIView):
    def get(self, request):
        from .models import TkdClub
        from .serializers import ClubSerializer
        return Response(ClubSerializer(TkdClub.objects.all(), many=True).data)


class UpdateCoachClubsAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request):
        coach = request.user.profile
        if not coach.is_coach:
            return Response({"error": "شما مربی نیستید."}, status=403)

        club_ids = request.data.get("coaching_clubs", [])
        if not isinstance(club_ids, list) or len(club_ids) > 3:
            return Response({"error": "حداکثر ۳ باشگاه مجاز است."}, status=400)

        clubs = TkdClub.objects.filter(id__in=club_ids)
        coach.coaching_clubs.set(clubs)
        return Response({"message": "باشگاه‌ها با موفقیت بروزرسانی شدند."})


class UpdateClubCoachesView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            club = TkdClub.objects.get(user=request.user)
        except TkdClub.DoesNotExist:
            return Response({"detail": "باشگاه یافت نشد."}, status=404)

        selected_ids = request.data.get("selected_coaches", [])
        if not isinstance(selected_ids, list):
            return Response({"detail": "داده‌ها معتبر نیستند."}, status=400)

        all_coaches = UserProfile.objects.filter(is_coach=True)
        active_ids = set(club.coaches.values_list('id', flat=True))

        selected_ids_set = set(selected_ids)

        to_add = selected_ids_set - active_ids
        to_remove = active_ids - selected_ids_set

        # درخواست‌های جدید ثبت کنیم
        for coach_id in to_add:
            coach = UserProfile.objects.filter(id=coach_id).first()
            if coach and coach.coaching_clubs.count() >= 3:
                continue  # محدودیت ۳ باشگاه
            CoachClubRequest.objects.get_or_create(
                coach=coach,
                club=club,
                request_type='add',
                defaults={"status": "pending"}
            )

        for coach_id in to_remove:
            coach = UserProfile.objects.filter(id=coach_id).first()
            CoachClubRequest.objects.get_or_create(
                coach=coach,
                club=club,
                request_type='remove',
                defaults={"status": "pending"}
            )

        return Response({"detail": "درخواست‌ها با موفقیت ثبت شدند."})


class PendingCoachRequestsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user_profile = request.user.profile
        requests = CoachClubRequest.objects.filter(coach=user_profile, status='pending')
        serializer = CoachClubRequestSerializer(requests, many=True)
        return Response(serializer.data)


class RespondToCoachRequestView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        user_profile = request.user.profile
        action = request.data.get("action")  # "accept" یا "reject"

        try:
            req = CoachClubRequest.objects.get(id=pk, coach=user_profile, status='pending')
        except CoachClubRequest.DoesNotExist:
            return Response({"detail": "درخواست یافت نشد."}, status=404)

        if action == "accept":
            if req.request_type == "add":
                user_profile.coaching_clubs.add(req.club)
            elif req.request_type == "remove":
                user_profile.coaching_clubs.remove(req.club)

            req.status = 'accepted'
            req.save()
            return Response({"detail": "درخواست تأیید شد."})

        elif action == "reject":
            req.status = 'rejected'
            req.save()
            return Response({"detail": "درخواست رد شد."})

        return Response({"detail": "دستور نامعتبر است."}, status=400)


class HeyatLoginAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        try:
            username = request.data.get("username")
            password = request.data.get("password")

            print(" Login Attempt:")
            print("Username:", username)
            print("Password:", password)

            if not username or not password:
                return Response({"error": "نام کاربری و رمز عبور الزامی هستند."}, status=400)

            user = authenticate(username=username, password=password)
            if not user:
                print("❌ Authentication failed")
                return Response({"error": "نام کاربری یا رمز عبور اشتباه است."}, status=401)

            try:
                from accounts.models import TkdBoard
                board = TkdBoard.objects.get(user=user)
            except Exception as e:
                print("🚫 TkdBoard not found:", e)
                return Response({"error": "هیأت مرتبط یافت نشد."}, status=403)

            refresh = RefreshToken.for_user(user)

            return Response({
                "access": str(refresh.access_token),
                "role": "heyat",
                "board_id": board.id,
                "board_name": board.name
            })

        except Exception as e:
            import traceback
            traceback.print_exc()  # لاگ کامل خطا
            return Response({"error": "🔥 خطای سرور: " + str(e)}, status=500)


class HeyatStudentsAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            board = TkdBoard.objects.get(user=request.user)
        except TkdBoard.DoesNotExist:
            return Response({"detail": "هیئت پیدا نشد"}, status=404)

        students = UserProfile.objects.filter(role='player', tkd_board=board)

        # 🎯 فیلتر مربی
        coach = request.GET.get("coach")
        if coach and coach != "مربی":
            students = students.annotate(
                full_name=Concat('coach__first_name', Value(' '), 'coach__last_name', output_field=CharField())
            ).filter(full_name__icontains=coach)

        # 🎯 فیلتر باشگاه
        club = request.GET.get("club")
        if club and club != "باشگاه":
            students = students.filter(club__club_name=club)

        # 🎯 فیلتر کمربند
        belt = request.GET.get("belt")
        if belt and belt != "درجه کمربند":
            students = students.filter(belt_grade=belt)

        # 🎯 فیلتر تاریخ تولد
        birth_from = request.GET.get("birth_from")
        if birth_from:
            students = students.filter(birth_date__gte=birth_from)

        birth_to = request.GET.get("birth_to")
        if birth_to:
            students = students.filter(birth_date__lte=birth_to)

        # 🔍 فیلتر جستجو
        search = request.GET.get("search")
        if search:
            students = students.filter(
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search) |
                Q(national_code__icontains=search)
            )
        students = annotate_student_stats(students)
        serialized = ClubStudentSerializer(students, many=True)
        return Response(serialized.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def heyat_form_data(request):
    try:
        board = TkdBoard.objects.get(user=request.user)
    except TkdBoard.DoesNotExist:
        return Response({"detail": "هیئت یافت نشد"}, status=404)

    coaches = UserProfile.objects.filter(tkd_board=board, is_coach=True)
    clubs = TkdClub.objects.filter(tkd_board=board)

    coach_names = [
        {"id": c.id, "name": f"{c.first_name} {c.last_name}"} for c in coaches
    ]
    club_names = [{"id": c.id, "club_name": c.club_name} for c in clubs]

    return Response({
        "coaches": coach_names,
        "clubs": club_names
    })


class HeyatCoachesAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            board = TkdBoard.objects.get(user=request.user)
        except TkdBoard.DoesNotExist:
            return Response({"detail": "هیئت یافت نشد"}, status=status.HTTP_404_NOT_FOUND)

        coaches = UserProfile.objects.filter(
            tkd_board=board,
            is_coach=True,

        ).prefetch_related("coaching_clubs")

        # 🎯 فیلتر باشگاه
        club = request.GET.get("club")
        if club and club != "همه":
            coaches = coaches.filter(coaching_clubs__club_name=club)

        # 🎯 فیلتر کمربند
        belt = request.GET.get("belt")
        if belt and belt != "همه":
            coaches = coaches.filter(belt_grade=belt)

        # 🎯 تاریخ تولد
        birth_from = request.GET.get("birth_from")
        if birth_from:
            coaches = coaches.filter(birth_date__gte=birth_from)

        birth_to = request.GET.get("birth_to")
        if birth_to:
            coaches = coaches.filter(birth_date__lte=birth_to)

        # 🎓 فیلتر درجه ملی
        national_level = request.GET.get("national_level")
        if national_level and national_level != "همه":
            coaches = coaches.filter(coach_level=national_level)

        # 🌍 فیلتر درجه بین‌المللی
        international_level = request.GET.get("international_level")
        if international_level and international_level != "همه":
            coaches = coaches.filter(coach_level_International=international_level)

        # 🔍 فیلتر جستجوی نام یا کد ملی
        search = request.GET.get("search")
        if search:
            coaches = coaches.filter(
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search) |
                Q(national_code__icontains=search)
            )

        # نتیجه نهایی
        result = []
        for coach in coaches.distinct():
            result.append({
                "full_name": f"{coach.first_name} {coach.last_name}",
                "national_code": coach.national_code,
                "birth_date": coach.birth_date,
                "belt_grade": coach.belt_grade,
                "national_certificate_date": coach.coach_level or "—",
                "international_certificate_date": coach.coach_level_International or "درجه بین‌الملل ندارد",
                "clubs": [club.club_name for club in coach.coaching_clubs.all()]
            })

        return Response(result)


class HeyatRefereesAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            board = TkdBoard.objects.get(user=request.user)
        except TkdBoard.DoesNotExist:
            return Response({"detail": "هیئت یافت نشد"}, status=status.HTTP_404_NOT_FOUND)

        referees = UserProfile.objects.filter(tkd_board=board, is_referee=True)

        # ---------- فیلترها ----------
        club = request.GET.get("club")
        if club and club != "همه":
            referees = referees.filter(coaching_clubs__club_name=club)

        belt = request.GET.get("belt")
        if belt and belt != "همه":
            referees = referees.filter(belt_grade=belt)

        birth_from = request.GET.get("birth_from")
        if birth_from:
            referees = referees.filter(birth_date__gte=birth_from)

        birth_to = request.GET.get("birth_to")
        if birth_to:
            referees = referees.filter(birth_date__lte=birth_to)

        search = request.GET.get("search")
        if search:
            referees = referees.filter(
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search) |
                Q(national_code__icontains=search)
            )

        referee_field = request.GET.get("referee_field")
        if referee_field and referee_field != "همه":
            field_map = {
                "کیوروگی": "kyorogi",
                "پومسه": "poomseh",
                "هانمادانگ": "hanmadang"
            }
            field_key = field_map.get(referee_field)
            if field_key:
                referees = referees.filter(**{f"{field_key}": True})

        # ---------- فیلتر درجات داوری ----------
        national_level = request.GET.get("national_level")
        international_level = request.GET.get("international_level")

        if national_level and national_level != "همه":
            referees = referees.filter(
                Q(kyorogi_level=national_level) |
                Q(poomseh_level=national_level) |
                Q(hanmadang_level=national_level)
            )

        if international_level and international_level != "همه":
            referees = referees.filter(
                Q(kyorogi_level_International=international_level) |
                Q(poomseh_level_International=international_level) |
                Q(hanmadang_level_International=international_level)
            )

        # ---------- پاسخ ----------
        result = []
        for r in referees:
            result.append({
                "full_name": f"{r.first_name} {r.last_name}",
                "national_code": r.national_code,
                "birth_date": r.birth_date,
                "belt_grade": r.belt_grade,
                "clubs": [c.club_name for c in r.coaching_clubs.all()],
                "referee_fields": {
                    "کیوروگی": {
                        "active": r.kyorogi,
                        "national": r.kyorogi_level or "درجه ملی ندارد",
                        "international": r.kyorogi_level_International or "درجه بین‌الملل ندارد"
                    },
                    "پومسه": {
                        "active": r.poomseh,
                        "national": r.poomseh_level or "درجه ملی ندارد",
                        "international": r.poomseh_level_International or "درجه بین‌الملل ندارد"
                    },
                    "هانمادانگ": {
                        "active": r.hanmadang,
                        "national": r.hanmadang_level or "درجه ملی ندارد",
                        "international": r.hanmadang_level_International or "درجه بین‌الملل ندارد"
                    },
                }
            })

        return Response(result)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def heyat_clubs_list(request):
    try:
        board = TkdBoard.objects.get(user=request.user)
    except TkdBoard.DoesNotExist:
        return Response({"detail": "هیئت یافت نشد."}, status=status.HTTP_403_FORBIDDEN)

    clubs = TkdClub.objects.filter(tkd_board=board)

    # --- جستجو اختیاری ---
    search = request.GET.get("search")
    if search:
        clubs = clubs.filter(
            Q(club_name__icontains=search) |
            Q(founder_name__icontains=search) |
            Q(founder_phone__icontains=search)
        )

    # --- ساخت خروجی ---
    data = []
    for club in clubs:
        student_count = UserProfile.objects.filter(club=club, role="player").count()
        coach_count = UserProfile.objects.filter(coaching_clubs=club, is_coach=True).count()

        data.append({
            "id": club.id,
            "club_name": club.club_name,
            "manager_name": club.founder_name,
            "phone": club.phone,
            "manager_phone": club.founder_phone,
            "student_count": student_count,
            "coach_count": coach_count
        })

    return Response(data, status=status.HTTP_200_OK)

class KyorugiCompetitionListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # پروفایل کاربر (بازیکن/مربی/داور/…)
        profile = UserProfile.objects.select_related('coach').filter(user=request.user).first()

        # نقش را تشخیص بده؛ برای باشگاه/هیئت که UserProfile ندارند:
        role = None
        is_coach = False
        if profile:
            role = profile.role
            is_coach = bool(profile.is_coach or role in ['coach', 'both'])
        elif TkdClub.objects.filter(user=request.user).exists():
            role = 'club'
        elif TkdBoard.objects.filter(user=request.user).exists():
            role = 'heyat'
        else:
            return Response([])  # ناشناس

        qs = KyorugiCompetition.objects.all().order_by('-id')

        if is_coach:
            # مربی/بوث → همه مسابقات
            pass

        elif role == 'player':
            # بازیکن فقط مسابقاتی که مربی‌اش تایید کرده
            if profile and profile.coach_id:
                qs = qs.filter(
                    coach_approvals__coach=profile.coach,
                    coach_approvals__is_active=True,
                    coach_approvals__terms_accepted=True,
                ).distinct()
            else:
                qs = qs.none()

        elif role == 'referee':
            # داور → مسابقات باز در بازه ثبت‌نام
            today = now().date()
            qs = qs.filter(
                registration_open=True,
                registration_start__lte=today,
                registration_end__gte=today,
            )

        elif role in ['club', 'heyat']:
            # باشگاه/هیئت → نمایش همه (فقط مشاهده‌ی جزئیات/نتایج/جدول در فرانت)
            pass

        data = DashboardKyorugiCompetitionSerializer(qs, many=True, context={'request': request}).data
        return Response(data)



# ✅ مسیر import را با محل واقعی پروفایل خودت هماهنگ کن
from accounts.models import UserProfile  # اگر در اپ دیگری است، همان را import کن

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def mini_profile(request):
    u = request.user
    # پروفایل کاربر
    prof = getattr(u, "profile", None) or UserProfile.objects.filter(user=u).first()

    # مقدار پیش‌فرض اگر پروفایل پیدا نشد
    if not prof:
        full_name = f"{(u.first_name or '').strip()} {(u.last_name or '').strip()}".strip()
        return Response({
            "full_name": full_name or (getattr(u, "username", "") or ""),
            "first_name": (u.first_name or "").strip(),
            "last_name": (u.last_name or "").strip(),
            "national_code": "",
            "belt_grade": "",
            "role": "",
            "profile_image_url": None,
        })

    def abs_url(filefield):
        try:
            if filefield and getattr(filefield, "url", None):
                return request.build_absolute_uri(filefield.url)
        except Exception:
            pass
        return None

    data = {
        "full_name": f"{(prof.first_name or '').strip()} {(prof.last_name or '').strip()}".strip(),
        "first_name": (prof.first_name or "").strip(),
        "last_name": (prof.last_name or "").strip(),
        "national_code": (prof.national_code or "").strip(),
        "belt_grade": (prof.belt_grade or "").strip(),
        "role": (prof.role or "").strip(),
        "profile_image_url": abs_url(getattr(prof, "profile_image", None)),
    }
    return Response(data)

