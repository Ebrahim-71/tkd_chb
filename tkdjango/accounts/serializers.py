from rest_framework import serializers
from .models import PendingCoach, PendingUserProfile, TkdBoard, TkdClub, UserProfile,PendingClub,PendingEditProfile,CoachClubRequest
from competitions.models import KyorugiCompetition, CoachApproval
from django.contrib.auth import get_user_model
from datetime import datetime
import re
from django.utils import timezone
import jdatetime

User = get_user_model()


# -------------------- ۱. تایید شماره موبایل --------------------
class PhoneSerializer(serializers.Serializer):
    phone = serializers.CharField(
        max_length=11,
        error_messages={
            'blank': 'وارد کردن شماره موبایل الزامی است.',
            'required': 'شماره موبایل را وارد کنید.',
        }
    )
    role = serializers.ChoiceField(
        choices=['player', 'coach', 'referee', 'both', 'club'],
        error_messages={'required': 'نقش کاربر الزامی است.'}
    )

    def validate_phone(self, value):
        if not value.isdigit() or not value.startswith("09") or len(value) != 11:
            raise serializers.ValidationError("شماره موبایل معتبر نیست.")
        return value


class VerifyCodeSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=11)
    code = serializers.CharField(max_length=4)

    def validate(self, data):
        if not data['phone'].isdigit() or len(data['phone']) != 11:
            raise serializers.ValidationError("شماره موبایل معتبر نیست.")
        if not data['code'].isdigit() or len(data['code']) != 4:
            raise serializers.ValidationError("کد باید ۴ رقمی باشد.")
        return data

#--------------------------------------------------------------------------


class VerifyLoginCodeSerializer(serializers.Serializer):
    phone = serializers.CharField(
        max_length=11,
        error_messages={
            'blank': 'شماره موبایل را وارد کنید.',
            'required': 'شماره موبایل الزامی است.'
        }
    )
    code = serializers.CharField(
        max_length=4,
        min_length=4,
        error_messages={
            'blank': 'کد را وارد کنید.',
            'required': 'کد الزامی است.',
            'min_length': 'کد باید ۴ رقمی باشد.',
            'max_length': 'کد باید ۴ رقمی باشد.'
        }
    )
    role = serializers.ChoiceField(
        choices=['player', 'coach', 'referee', 'both', 'club'],
        error_messages={
            'required': 'نقش کاربر الزامی است.',
            'invalid_choice': 'نقش نامعتبر است.'
        }
    )

    def validate_phone(self, value):
        if not value.isdigit() or not value.startswith("09") or len(value) != 11:
            raise serializers.ValidationError("شماره موبایل معتبر نیست.")
        return value

    def validate_code(self, value):
        if not value.isdigit():
            raise serializers.ValidationError("کد باید فقط شامل عدد باشد.")
        return value





class PendingCoachSerializer(serializers.ModelSerializer):
    class Meta:
        model = PendingCoach
        exclude = ('submitted_at',)  # Or list explicitly the fields you want to expose

    def validate_national_code(self, value):
        if not value.isdigit() or len(value) != 10:
            raise serializers.ValidationError("کد ملی باید ۱۰ رقمی باشد.")

        original_user = self.context.get('original_user') or self.context.get('original_user')


        if PendingUserProfile.objects.filter(national_code=value).exclude(
                id=getattr(self.instance, 'id', None)).exists():
            raise serializers.ValidationError("این کد ملی قبلاً ثبت شده است.")

        if UserProfile.objects.filter(national_code=value).exclude(id=getattr(original_user, 'id', None)).exists():
            raise serializers.ValidationError("این کد ملی قبلاً ثبت شده است.")

        return value

    def validate_phone(self, value):
        if not value.isdigit() or not value.startswith("09") or len(value) != 11:
            raise serializers.ValidationError("شماره موبایل معتبر نیست.")

        original_user = self.context.get('original_user') or self.context.get('original_user')


        if PendingUserProfile.objects.filter(phone=value).exclude(id=getattr(self.instance, 'id', None)).exists():
            raise serializers.ValidationError("این شماره قبلاً ثبت شده است.")

        if UserProfile.objects.filter(phone=value).exclude(id=getattr(original_user, 'id', None)).exists():
            raise serializers.ValidationError("این شماره قبلاً ثبت شده است.")

        return value

    def validate_address(self, value):
        if len(value) < 10 or len(value) > 300:
            raise serializers.ValidationError("آدرس باید بین ۱۰ تا ۳۰۰ کاراکتر باشد.")
        if not re.match(r'^[؀-ۿ0-9\s،.\-]+$', value):
            raise serializers.ValidationError("آدرس شامل کاراکترهای غیرمجاز است.")
        return value

    def validate_profile_image(self, value):
        if value.size > 200 * 1024:
            raise serializers.ValidationError("حجم عکس باید کمتر از ۲۰۰ کیلوبایت باشد.")
        if not value.name.lower().endswith(('.jpg', '.jpeg')):
            raise serializers.ValidationError("فرمت عکس باید JPG باشد.")
        return value

    def validate(self, data):
        if not data.get('confirm_info'):
            raise serializers.ValidationError({"confirm_info": "تأیید اطلاعات الزامی است."})

        referee_types = self.initial_data.get('refereeTypes', {})
        if isinstance(referee_types, str):
            import json
            try:
                referee_types = json.loads(referee_types)
            except json.JSONDecodeError:
                referee_types = {}

        if data.get('is_referee'):
            selected_types = [t for t, v in referee_types.items() if v.get('selected')]
            if not selected_types:
                raise serializers.ValidationError({"refereeTypes": "حداقل یک نوع داوری باید انتخاب شود."})
            for key in selected_types:
                if not referee_types.get(key, {}).get('gradeNational'):
                    raise serializers.ValidationError({f"refereeTypes.{key}.gradeNational": f"درجه ملی داوری {key} الزامی است."})

        return data


class PendingPlayerSerializer(serializers.ModelSerializer):
    class Meta:
        model = PendingUserProfile
        exclude = ('submitted_at',)

    def validate_national_code(self, value):
        if not value.isdigit() or len(value) != 10:
            raise serializers.ValidationError("کد ملی باید ۱۰ رقمی باشد.")

        original_user = self.context.get('original_user')or self.context.get('original_user')


        if PendingUserProfile.objects.filter(national_code=value).exclude(
                id=getattr(self.instance, 'id', None)).exists():
            raise serializers.ValidationError("این کد ملی قبلاً ثبت شده است.")

        if UserProfile.objects.filter(national_code=value).exclude(id=getattr(original_user, 'id', None)).exists():
            raise serializers.ValidationError("این کد ملی قبلاً ثبت شده است.")

        return value



    def validate(self, data):
        if not data.get('confirm_info'):
            raise serializers.ValidationError({"confirm_info": "تأیید اطلاعات الزامی است."})
        return data

class PendingClubSerializer(serializers.ModelSerializer):
    class Meta:
        model = PendingClub
        fields = '__all__'

    def validate_phone(self, value):
        if not value.isdigit() or len(value) != 11:
            raise serializers.ValidationError("شماره تماس باید ۱۱ رقمی و فقط شامل عدد باشد.")
        if not (value.startswith('09') or value.startswith('038')):
            raise serializers.ValidationError("شماره تماس باید با 09 یا 038 شروع شود.")
        return value

    def validate_address(self, value):
        if len(value.strip()) < 10:
            raise serializers.ValidationError("آدرس باید حداقل ۱۰ کاراکتر باشد.")
        return value

    def validate_license_image(self, value):
        allowed_types = ['image/jpeg', 'image/jpg', 'image/png']
        max_size = 200 * 1024  # 500 KB

        if value.content_type not in allowed_types:
            raise serializers.ValidationError("فرمت تصویر باید JPG یا PNG باشد.")
        if value.size > max_size:
            raise serializers.ValidationError("حجم تصویر باید کمتر از ۲۰۰ کیلوبایت باشد.")
        return value

    def validate_club_name(self, value):
        clean_value = value.strip()
        if TkdClub.objects.filter(club_name__iexact=clean_value).exists() or PendingClub.objects.filter(
                club_name__iexact=clean_value).exists():
            raise serializers.ValidationError("باشگاهی با این نام قبلاً ثبت شده است.")
        return clean_value



class PlayerDashboardSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    profile_image_url = serializers.SerializerMethodField()

    class Meta:
        model = UserProfile
        fields = [
            "full_name", "profile_image_url", "role",
            "match_count", "seminar_count",
            "gold_medals", "silver_medals", "bronze_medals",
            "gold_medals_country", "silver_medals_country", "bronze_medals_country",
            "gold_medals_int", "silver_medals_int", "bronze_medals_int",
            "ranking_competition", "ranking_total",
            "belt_grade", "coach_name"
        ]

    def get_full_name(self, obj):
        return f"{obj.first_name} {obj.last_name}"

    def get_profile_image_url(self, obj):
        if obj.profile_image:
            return self.context['request'].build_absolute_uri(obj.profile_image.url)
        return ""



# serializers.py
class ClubStudentSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    coach_name = serializers.SerializerMethodField()
    club = serializers.CharField(source='club.club_name', read_only=True)

    # فیلدهای آماری
    competitions_count = serializers.IntegerField(read_only=True)
    gold_total = serializers.IntegerField(read_only=True)
    silver_total = serializers.IntegerField(read_only=True)
    bronze_total = serializers.IntegerField(read_only=True)
    ranking_total = serializers.FloatField(read_only=True)
    ranking_competition = serializers.FloatField(read_only=True)

    class Meta:
        model = UserProfile
        fields = [
            "full_name", "national_code", "birth_date", "belt_grade",
            "coach_name", "belt_certificate_date", "club",
            # جدیدها:
            "competitions_count", "gold_total", "silver_total", "bronze_total",
            "ranking_total", "ranking_competition",
        ]

    def get_full_name(self, obj):
        return f"{obj.first_name} {obj.last_name}"

    def get_coach_name(self, obj):
        if obj.coach:
            return f"{obj.coach.first_name} {obj.coach.last_name}"
        return "-"



class ClubCoachInfoSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    club_count = serializers.SerializerMethodField()
    is_active = serializers.SerializerMethodField()
    pending_status = serializers.SerializerMethodField()

    class Meta:
        model = UserProfile
        fields = [
            "id", "full_name", "national_code", "phone",
            "belt_grade", "club_count", "is_active", "pending_status"
        ]

    def get_full_name(self, obj):
        return f"{obj.first_name} {obj.last_name}"

    def get_club_count(self, obj):
        return obj.coaching_clubs.count()

    def get_is_active(self, obj):
        club = self.context.get("club")
        return club in obj.coaching_clubs.all()

    def get_pending_status(self, obj):
        pending_map = self.context.get("pending_map", {})
        if (obj.id, "add") in pending_map:
            return "add"
        elif (obj.id, "remove") in pending_map:
            return "remove"
        return None



class UserProfileSerializer(serializers.ModelSerializer):
    profile_image_url = serializers.SerializerMethodField()
    full_name = serializers.SerializerMethodField()
    club = serializers.SerializerMethodField()
    class Meta:
        model = UserProfile
        fields = "__all__"  # یا لیست دقیق فیلدهایی که لازم داری

    def get_profile_image_url(self, obj):
        request = self.context.get('request')
        if obj.profile_image and hasattr(obj.profile_image, 'url'):
            return request.build_absolute_uri(obj.profile_image.url)
        return None

    def get_full_name(self, obj):
        return f"{obj.first_name} {obj.last_name}"

    def get_club(self, obj):
        return obj.club.club_name if obj.club else "-"
def is_persian(value):
    pattern = re.compile(r'^[\u0600-\u06FF\s‌]+$')  # فارسی + فاصله + نیم‌فاصله
    return bool(pattern.match(value))

class PendingEditProfileSerializer(serializers.ModelSerializer):
    original_user = serializers.PrimaryKeyRelatedField(read_only=True)

    # ✅ اضافه‌شدن فیلدهای دستی:
    club_names = serializers.ListField(child=serializers.CharField(), required=False)
    kyorogi = serializers.BooleanField(required=False)
    poomseh = serializers.BooleanField(required=False)
    hanmadang = serializers.BooleanField(required=False)
    kyorogi_level = serializers.CharField(required=False, allow_blank=True)
    kyorogi_level_International = serializers.CharField(required=False, allow_blank=True,allow_null=True)
    poomseh_level = serializers.CharField(required=False, allow_blank=True)
    poomseh_level_International = serializers.CharField(required=False, allow_blank=True,allow_null=True)
    hanmadang_level = serializers.CharField(required=False, allow_blank=True)
    hanmadang_level_International = serializers.CharField(required=False, allow_blank=True,allow_null=True)
    profile_image = serializers.ImageField(required=False, allow_null=True)

    class Meta:
        model = PendingEditProfile
        exclude = ('submitted_at',)

    def validate_address(self, value):
        if len(value.strip()) < 10 or len(value.strip()) > 300:
            raise serializers.ValidationError("آدرس باید بین ۱۰ تا ۳۰۰ کاراکتر باشد.")
        if not is_persian(value):
            raise serializers.ValidationError("آدرس باید فقط شامل حروف فارسی باشد.")
        return value

    def validate_profile_image(self, value):
        if not value:
            return value  # اجباری نیست، پس خالی باشه مشکلی نیست

        if value.size > 200 * 1024:
            raise serializers.ValidationError("حجم عکس باید کمتر از ۲۰۰ کیلوبایت باشد.")
        if not value.name.lower().endswith(('.jpg', '.jpeg')):
            raise serializers.ValidationError("فرمت عکس باید JPG باشد.")
        return value

    def validate(self, data):
        errors = {}

        # اجباری بودن درجه ملی مربیگری
        if data.get("is_coach") and not data.get("coach_level"):
            errors["coach_level"] = "درجه ملی مربیگری الزامی است."

        # اجباری بودن درجه ملی برای هر رشته داوری فعال‌شده
        if data.get("is_referee"):
            if data.get("kyorogi") and not data.get("kyorogi_level"):
                errors["kyorogi_level"] = "درجه ملی کیوروگی الزامی است."
            if data.get("poomseh") and not data.get("poomseh_level"):
                errors["poomseh_level"] = "درجه ملی پومسه الزامی است."
            if data.get("hanmadang") and not data.get("hanmadang_level"):
                errors["hanmadang_level"] = "درجه ملی هانمادانگ الزامی است."

        # اگر خطا وجود داشت، raise کنیم
        if errors:
            raise serializers.ValidationError(errors)

        return data

class ClubSerializer(serializers.ModelSerializer):
    class Meta:
        model = TkdClub
        fields = ['id', 'club_name', 'founder_name']


class CoachClubRequestSerializer(serializers.ModelSerializer):
    club_name = serializers.SerializerMethodField()

    class Meta:
        model = CoachClubRequest
        fields = ['id', 'request_type', 'status', 'club_name']

    def get_club_name(self, obj):
        return obj.club.club_name




# accounts serializers (DashboardKyorugiCompetitionSerializer)
class DashboardKyorugiCompetitionSerializer(serializers.ModelSerializer):
    age_category_name   = serializers.CharField(source='age_category.name', read_only=True)
    belt_level_display  = serializers.CharField(source='get_belt_level_display', read_only=True)
    gender_display      = serializers.CharField(source='get_gender_display', read_only=True)
    style_display       = serializers.ReadOnlyField()

    coach_approved = serializers.SerializerMethodField()
    status         = serializers.SerializerMethodField()
    can_register   = serializers.SerializerMethodField()

    registration_start_jalali = serializers.SerializerMethodField()
    registration_end_jalali   = serializers.SerializerMethodField()
    draw_date_jalali          = serializers.SerializerMethodField()
    competition_date_jalali   = serializers.SerializerMethodField()

    # ✅ اضافه شد: قالب تعهدنامه برای مودال
    terms_title   = serializers.SerializerMethodField()
    terms_content = serializers.SerializerMethodField()

    class Meta:
        model = KyorugiCompetition
        fields = [
            'id', 'public_id',
            'title', 'poster', 'city', 'entry_fee',
            'age_category_name', 'belt_level_display', 'gender_display',
            'style_display',
            'registration_start', 'registration_end', 'draw_date', 'competition_date',
            'registration_start_jalali', 'registration_end_jalali',
            'draw_date_jalali', 'competition_date_jalali',
            'coach_approved', 'status', 'can_register',
            # ✅ این‌ها برای مودال
            'terms_title', 'terms_content',
        ]

    # ... بقیه کد قبلی‌ات همون بمونه ...

    def _today(self):
        return timezone.localdate()

    def _is_open(self, obj):
        t = self._today()
        try:
            return bool(obj.registration_open and obj.registration_start <= t <= obj.registration_end)
        except Exception:
            return False

    def _to_jalali(self, d):
        if not d:
            return None
        if isinstance(d, str):
            return d[:10].replace('-', '/')
        if hasattr(d, 'year') and d.year < 1700:
            return f"{d.year:04d}/{d.month:02d}/{d.day:02d}"
        try:
            import jdatetime
            return jdatetime.date.fromgregorian(date=d).strftime('%Y/%m/%d')
        except Exception:
            return str(d)[:10].replace('-', '/')

    # ---------- computed ----------
    def get_status(self, obj):
        t = self._today()
        if self._is_open(obj):
            return 'open'
        if obj.registration_start and t < obj.registration_start:
            return 'upcoming'
        return 'past'

    def get_coach_approved(self, obj):
        request = self.context.get('request')
        if not request:
            return None
        profile = UserProfile.objects.filter(user=request.user).first()
        if not profile or not getattr(profile, 'is_coach', False):
            return None
        return CoachApproval.objects.filter(
            competition=obj, coach=profile, is_active=True, terms_accepted=True
        ).exists()

    def get_can_register(self, obj):
        request = self.context.get('request')
        if not request or not self._is_open(obj):
            return False
        profile = UserProfile.objects.filter(user=request.user).first()
        if not profile:
            return False
        if getattr(profile, 'is_coach', False):
            return True
        if getattr(profile, 'role', None) == 'player' and getattr(profile, 'coach_id', None):
            return CoachApproval.objects.filter(
                competition=obj, coach=profile.coach, is_active=True, terms_accepted=True
            ).exists()
        return False

    def get_registration_start_jalali(self, obj):
        return self._to_jalali(obj.registration_start)

    def get_registration_end_jalali(self, obj):
        return self._to_jalali(obj.registration_end)

    def get_draw_date_jalali(self, obj):
        return self._to_jalali(obj.draw_date)

    def get_competition_date_jalali(self, obj):
        return self._to_jalali(obj.competition_date)

    # ✅ این دو تا تازه:
    def get_terms_title(self, obj):
        return obj.terms_template.title if obj.terms_template else None

    def get_terms_content(self, obj):
        return obj.terms_template.content if obj.terms_template else None
