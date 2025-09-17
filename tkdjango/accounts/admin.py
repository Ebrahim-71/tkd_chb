# accounts/admin.py
from django.contrib import admin
from django import forms
from django.contrib import messages
from django.shortcuts import get_object_or_404, redirect
from django.urls import path, reverse
from django.contrib.auth import get_user_model

from .models import (
    PendingCoach, PendingReferee, PendingPlayer,
    ApprovedCoach, ApprovedReferee, ApprovedPlayer,
    UserProfile, PendingClub, TkdClub, TkdBoard, PendingEditProfile
)

UserModel = get_user_model()


# -------------------------------
# Helper: ایجاد/بازیابی User با یوزرنیم = شماره موبایل
# -------------------------------
def get_or_create_auth_user_by_phone(phone: str):
    user, _ = UserModel.objects.get_or_create(
        username=phone,
        defaults={'is_active': True}
    )
    if not user.has_usable_password():
        user.set_unusable_password()
        user.save()
    return user


# -------------------------------
# میکسین برای ساخت URL «تأیید تکی» در صفحهٔ جزئیات پنِدینگ
# -------------------------------
class PendingSingleApproveMixin:
    """
    به Adminهای Pending اضافه می‌شود تا یک مسیر «approve/» تکی داشته باشیم
    و همان منطق اکشن گروهی approve را روی همان رکورد اجرا کنیم.
    """
    change_form_template = "admin/accounts/pendinguserprofile/change_form.html"  # مطمئن شو این فایل وجود داره

    def get_urls(self):
        urls = super().get_urls()
        info = self.model._meta  # app_label, model_name
        custom = [
            path(
                "<int:pk>/approve/",
                self.admin_site.admin_view(self.approve_single),
                name=f"{info.app_label}_{info.model_name}_approve",
            ),
        ]
        return custom + urls

    def approve_single(self, request, pk, *args, **kwargs):
        # اجرای اکشن approve روی یک رکورد
        self.approve(request, self.model.objects.filter(pk=pk))
        # معمولاً Pending بعد از approve حذف می‌شود؛ برگرد به changelist
        return redirect(
            reverse(f"admin:{self.model._meta.app_label}_{self.model._meta.model_name}_changelist")
        )


# -------------------------------
# Pending Coach
# -------------------------------
class PendingCoachAdmin(PendingSingleApproveMixin, admin.ModelAdmin):
    list_display = ['first_name', 'last_name', 'phone', 'submitted_at']
    actions = ['approve']
    change_form_template = "admin/accounts/pendinguserprofile/change_form.html"

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return qs.filter(role__in=['coach', 'both'])

    def approve(self, request, queryset):
        count = 0
        for pending in queryset:
            user_obj = get_or_create_auth_user_by_phone(pending.phone)

            profile = UserProfile.objects.create(
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
                is_coach=True,
                is_referee=pending.role in ['referee', 'both'],
                coach_level=pending.coach_level,
                coach_level_International=pending.coach_level_International,
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
                user=user_obj,
            )
            profile.coaching_clubs.set(pending.coaching_clubs.all())
            pending.delete()
            count += 1
        self.message_user(request, f"{count} مربی با موفقیت تأیید شدند.")
    approve.short_description = "تأیید و انتقال به کاربران اصلی"


# -------------------------------
# Pending Referee
# -------------------------------
class PendingRefereeAdmin(PendingSingleApproveMixin, admin.ModelAdmin):
    list_display = ['first_name', 'last_name', 'phone', 'submitted_at']
    actions = ['approve']
    change_form_template = "admin/accounts/pendinguserprofile/change_form.html"

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return qs.filter(role__in=['referee', 'both'])

    def approve(self, request, queryset):
        count = 0
        for pending in queryset:
            user_obj = get_or_create_auth_user_by_phone(pending.phone)

            profile = UserProfile.objects.create(
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
                is_coach=pending.role in ['coach', 'both'],
                is_referee=True,
                coach_level=pending.coach_level,
                coach_level_International=pending.coach_level_International,
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
                user=user_obj,
            )
            profile.coaching_clubs.set(pending.coaching_clubs.all())
            pending.delete()
            count += 1
        self.message_user(request, f"{count} داور با موفقیت تأیید شدند.")
    approve.short_description = "تأیید و انتقال به کاربران اصلی"


# -------------------------------
# Pending Player
# -------------------------------
class PendingPlayerAdmin(PendingSingleApproveMixin, admin.ModelAdmin):
    list_display = ['first_name', 'last_name', 'phone', 'submitted_at']
    actions = ['approve']
    change_form_template = "admin/accounts/pendinguserprofile/change_form.html"

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return qs.filter(role='player')

    def approve(self, request, queryset):
        count = 0
        for pending in queryset:
            user_obj = get_or_create_auth_user_by_phone(pending.phone)

            profile = UserProfile.objects.create(
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
                is_coach=False,
                is_referee=False,
                confirm_info=pending.confirm_info,
                club_names=pending.club_names,
                coach_name=pending.coach_name,
                club=pending.club,
                user=user_obj,
            )
            profile.coaching_clubs.set(pending.coaching_clubs.all())
            pending.delete()
            count += 1
        self.message_user(request, f"{count} بازیکن با موفقیت تأیید شدند.")
    approve.short_description = "تأیید و انتقال به کاربران اصلی"


# -------------------------------
# Approved Admins
# -------------------------------
class ApprovedCoachAdmin(admin.ModelAdmin):
    list_display = ['first_name', 'last_name', 'phone']
    def get_queryset(self, request):
        return super().get_queryset(request).filter(is_coach=True)

class ApprovedRefereeAdmin(admin.ModelAdmin):
    list_display = ['first_name', 'last_name', 'phone']
    def get_queryset(self, request):
        return super().get_queryset(request).filter(is_referee=True)

class ApprovedPlayerAdmin(admin.ModelAdmin):
    list_display = ['first_name', 'last_name', 'phone']
    def get_queryset(self, request):
        return super().get_queryset(request).filter(role='player')


# -------------------------------
# UserProfile Admin
# -------------------------------
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ['first_name', 'last_name', 'phone', 'role', 'display_coach_level', 'display_coach_level_International']
    search_fields = ['first_name', 'last_name', 'phone', 'national_code']

    def display_coach_level(self, obj):
        return obj.get_coach_level_display() or '-'
    display_coach_level.short_description = 'درجه مربیگری'

    def display_coach_level_International(self, obj):
        return obj.get_coach_level_International_display() or '-'
    display_coach_level_International.short_description = 'درجه بین‌المللی مربیگری'


# -------------------------------
# TkdClub + PendingClub
# -------------------------------
class TkdClubAdmin(admin.ModelAdmin):
    list_display = ['club_name', 'founder_name', 'founder_phone', 'province', 'created_at']
    search_fields = ['club_name', 'founder_name', 'founder_phone']

class PendingClubAdmin(admin.ModelAdmin):
    list_display = ['club_name', 'founder_name', 'founder_phone', 'province', 'submitted_at']
    actions = ['approve']
    change_form_template = "admin/accounts/pendinguserprofile/approve_pending_club.html"

    def approve(self, request, queryset):
        count = 0
        for pending in queryset:
            user_obj = get_or_create_auth_user_by_phone(pending.founder_phone)

            TkdClub.objects.create(
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
                user=user_obj,  # برای لاگین باشگاه
            )
            pending.delete()
            count += 1
        self.message_user(request, f"{count} باشگاه با موفقیت تأیید شد.")
    approve.short_description = "تأیید و انتقال به لیست باشگاه‌ها"


# -------------------------------
# PendingEditProfile (فقط اعمال ویرایش؛ User نمی‌سازد)
# -------------------------------
class PendingEditsAdmin(admin.ModelAdmin):
    list_display = ['first_name', 'last_name', 'phone', 'role']
    actions = ['approve']
    change_form_template = "admin/accounts/pendinguserprofile/approve_edited_profile.html"

    def get_queryset(self, request):
        return super().get_queryset(request).filter(original_user__isnull=False)

    def approve(self, request, queryset):
        count = 0
        for pending in queryset:
            user = pending.original_user
            if not user:
                continue

            # بروزرسانی فیلدها
            for field in [
                'first_name', 'last_name', 'birth_date', 'belt_grade', 'belt_certificate_number',
                'belt_certificate_date', 'address', 'coach', 'coach_name', 'club', 'club_names',
                'tkd_board', 'tkd_board_name', 'coach_level', 'coach_level_International',
                'kyorogi', 'kyorogi_level', 'kyorogi_level_International',
                'poomseh', 'poomseh_level', 'poomseh_level_International',
                'hanmadang', 'hanmadang_level', 'hanmadang_level_International',
                'is_coach', 'is_referee',
            ]:
                setattr(user, field, getattr(pending, field))

            if pending.coaching_clubs.exists():
                user.coaching_clubs.set(pending.coaching_clubs.all())

            # تصویر جدید
            if pending.profile_image:
                user.profile_image = pending.profile_image

            user.save()
            pending.delete()
            count += 1

        self.message_user(request, f"{count} ویرایش تأیید شد.")
    approve.short_description = "تأیید و اعمال ویرایش"


# -------------------------------
# TkdBoard (با فرم ساخت/ویرایش یوزر)
# -------------------------------
class TkdBoardAdminForm(forms.ModelForm):
    username = forms.CharField(label="یوزرنیم", required=False)
    password = forms.CharField(label="رمز عبور", required=False, widget=forms.PasswordInput)

    class Meta:
        model = TkdBoard
        fields = '__all__'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance and self.instance.user:
            self.fields['username'].initial = self.instance.user.username

    def save(self, commit=True):
        instance = super().save(commit=False)
        username = self.cleaned_data.get("username")
        password = self.cleaned_data.get("password")

        if instance.user:
            user = instance.user
            if username:
                user.username = username
            if password:
                user.set_password(password)
            user.save()
        elif username and password:
            user = UserModel.objects.create_user(username=username, password=password)
            instance.user = user

        if commit:
            instance.save()
        return instance


@admin.register(TkdBoard)
class TkdBoardAdmin(admin.ModelAdmin):
    form = TkdBoardAdminForm
    list_display = ['name', 'province', 'city', 'user']
    search_fields = ['name', 'province', 'city']


# -------------------------------
# Register
# -------------------------------
admin.site.register(UserProfile, UserProfileAdmin)
admin.site.register(ApprovedPlayer, ApprovedPlayerAdmin)
admin.site.register(ApprovedCoach, ApprovedCoachAdmin)
admin.site.register(ApprovedReferee, ApprovedRefereeAdmin)
admin.site.register(TkdClub, TkdClubAdmin)
admin.site.register(PendingPlayer, PendingPlayerAdmin)
admin.site.register(PendingCoach, PendingCoachAdmin)
admin.site.register(PendingReferee, PendingRefereeAdmin)
admin.site.register(PendingClub, PendingClubAdmin)
admin.site.register(PendingEditProfile, PendingEditsAdmin)
