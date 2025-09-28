# -*- coding: utf-8 -*-
from __future__ import annotations
from django.utils.dateparse import parse_date, parse_datetime
import datetime as _dt

from django import forms
from django.conf import settings
from django.contrib import admin, messages
from django.contrib.admin.filters import RelatedFieldListFilter
from django.contrib.admin.views.decorators import staff_member_required
from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.db.models import Prefetch
from django.middleware.csrf import get_token
from django.shortcuts import render, redirect, get_object_or_404
from django.template.response import TemplateResponse
from django.templatetags.static import static
from django.urls import path, reverse
from django.utils import timezone
from django.utils.html import format_html

import datetime
import json
from collections import defaultdict

import jdatetime
import django_jalali.admin as jadmin
import django_jalali.forms as jforms
from django_jalali.admin.filters import JDateFieldListFilter

from .models import (
    AgeCategory, Belt, BeltGroup, WeightCategory, KyorugiCompetition,
    MatAssignment, CompetitionImage, CompetitionFile, CoachApproval, TermsTemplate,
    Enrollment, Draw, Match, DrawStart, KyorugiResult,
    Seminar, SeminarRegistration,PoomsaeCompetition, PoomsaeImage, PoomsaeFile, PoomsaeCoachApproval
)
from .services.draw_service import create_draw_for_group
from .services.results_service import apply_results_and_points
from competitions.services.numbering_service import (
    number_matches_for_competition,
    clear_match_numbers_for_competition,
)
from django.urls import reverse
from urllib.parse import urlencode





from competitions.services.numbering_service import (
    number_matches_for_competition, clear_match_numbers_for_competition,
)

# -------------------------------------------------------------------
# تنظیمات و کمک‌تابع‌ها
# -------------------------------------------------------------------

ELIGIBLE_STATUSES = ("paid", "confirmed", "accepted", "completed")

# competitions/admin.py (پایین فایل)

class MatchNumberingEntry(KyorugiCompetition):
    class Meta:
        proxy = True
        verbose_name = "شماره‌گذاری بازی‌ها"
        verbose_name_plural = "شماره‌گذاری بازی‌ها"

@admin.register(MatchNumberingEntry)
class MatchNumberingEntryAdmin(admin.ModelAdmin):
    def has_add_permission(self, request): return False
    def has_change_permission(self, request, obj=None): return False
    def has_delete_permission(self, request, obj=None): return False

    def changelist_view(self, request, extra_context=None):
        from django.shortcuts import redirect
        from django.urls import reverse
        return redirect(reverse("admin:competitions_match_numbering"))

def _to_greg(v):
    """jdatetime.date -> datetime.date (Gregorian) یا همان ورودی در غیر این‌صورت."""
    if isinstance(v, jdatetime.date):
        return v.togregorian()
    return v


def _init_jalali(form, field_names):
    """
    مقداردهی اولیهٔ فیلدهای jDateField با معادل جلالی.
    روی date/datetime/str ISO هم کار می‌کند.
    """
    for name in field_names:
        v = form.initial.get(name) or getattr(form.instance, name, None)
        if not v:
            continue
        # اگر از قبل jdatetime است
        if isinstance(v, jdatetime.date):
            form.initial[name] = v
            continue
        # datetime -> date
        if isinstance(v, datetime.datetime):
            v = v.date()
        # date
        if isinstance(v, datetime.date):
            form.initial[name] = jdatetime.date.fromgregorian(date=v)
            continue
        # string ISO
        if isinstance(v, str):
            try:
                d = datetime.date.fromisoformat(v[:10])
                form.initial[name] = jdatetime.date.fromgregorian(date=d)
            except ValueError:
                pass


def _to_jalali_str(value):
    """
    value: datetime | date | 'YYYY-MM-DD' | 'YYYY-MM-DDTHH:MM[:SS]'
    return: 'YYYY/MM/DD' or '-'
    """
    if not value:
        return "-"

    try:
        if isinstance(value, datetime.datetime):
            if timezone.is_aware(value):
                value = timezone.localtime(value)
            g_date = value.date()
        elif isinstance(value, datetime.date):
            g_date = value
        elif isinstance(value, str):
            # قبول هر دو فرمت تاریخ/دیتایم
            dt = parse_datetime(value)
            if dt:
                if timezone.is_aware(dt):
                    dt = timezone.localtime(dt)
                g_date = dt.date()
            else:
                d = parse_date(value)
                g_date = d if d else None
        else:
            g_date = None

        if not g_date:
            return "-"

        j = jdatetime.date.fromgregorian(date=g_date)
        return j.strftime("%Y/%m/%d")
    except Exception:
        return "-"

def _full_name(u):
    """نام کامل برای نمایش در براکت/لیست‌ها."""
    if not u:
        return None
    for a in ("full_name", "name"):
        v = getattr(u, a, None)
        if v:
            return v
    fn = (getattr(u, "first_name", "") or "").strip()
    ln = (getattr(u, "last_name", "") or "").strip()
    return (fn + " " + ln).strip() or getattr(u, "username", None)


def _jalali(d):
    try:
        return jdatetime.date.fromgregorian(date=d).strftime("%Y/%m/%d") if d else "—"
    except Exception:
        return "—"


def _logo_url():
    """لوگوی هیئت برای هدر چاپ."""
    url = getattr(settings, "BOARD_LOGO_URL", None)
    if url:
        return url
    return static("img/board-logo.png")


# -------------------------------------------------------------------
# فرم‌های جلالی (Kyorugi)
# -------------------------------------------------------------------

class KyorugiCompetitionAdminForm(forms.ModelForm):
    registration_start = jforms.jDateField(widget=jadmin.widgets.AdminjDateWidget)
    registration_end   = jforms.jDateField(widget=jadmin.widgets.AdminjDateWidget)
    weigh_date         = jforms.jDateField(required=False, widget=jadmin.widgets.AdminjDateWidget)
    draw_date          = jforms.jDateField(required=False, widget=jadmin.widgets.AdminjDateWidget)
    competition_date   = jforms.jDateField(widget=jadmin.widgets.AdminjDateWidget)

    class Meta:
        model = KyorugiCompetition
        fields = "__all__"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        _init_jalali(self, [
            "registration_start", "registration_end",
            "weigh_date", "draw_date", "competition_date",
        ])

    def clean_registration_start(self): return _to_greg(self.cleaned_data.get("registration_start"))
    def clean_registration_end(self):   return _to_greg(self.cleaned_data.get("registration_end"))
    def clean_weigh_date(self):         return _to_greg(self.cleaned_data.get("weigh_date"))
    def clean_draw_date(self):          return _to_greg(self.cleaned_data.get("draw_date"))
    def clean_competition_date(self):   return _to_greg(self.cleaned_data.get("competition_date"))


class AgeCategoryAdminForm(forms.ModelForm):
    from_date = jforms.jDateField(widget=jadmin.widgets.AdminjDateWidget)
    to_date   = jforms.jDateField(required=False, widget=jadmin.widgets.AdminjDateWidget)

    class Meta:
        model = AgeCategory
        fields = "__all__"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        _init_jalali(self, ["from_date", "to_date"])

    def clean_from_date(self): return _to_greg(self.cleaned_data.get("from_date"))
    def clean_to_date(self):   return _to_greg(self.cleaned_data.get("to_date"))


# -------------------------------------------------------------------
# اینلاین‌ها
# -------------------------------------------------------------------

class MatAssignmentInline(admin.TabularInline):
    model = MatAssignment
    extra = 1
    filter_horizontal = ("weights",)
    fields = ("mat_number", "weights")
    verbose_name = "زمین"
    verbose_name_plural = "زمین‌ها و اوزان"


class CompetitionImageInline(admin.TabularInline):
    model = CompetitionImage
    extra = 1
    verbose_name = "تصویر"
    verbose_name_plural = "تصاویر پیوست"


class CompetitionFileInline(admin.TabularInline):
    model = CompetitionFile
    extra = 1
    verbose_name = "فایل PDF"
    verbose_name_plural = "فایل‌های پیوست"


class CoachApprovalInline(admin.TabularInline):
    model = CoachApproval
    extra = 0
    fields = ("coach", "code", "terms_accepted", "is_active", "get_jalali_approved_at")
    readonly_fields = ("code", "get_jalali_approved_at")
    raw_id_fields = ("coach",)

    @admin.display(description="تاریخ تأیید (شمسی)")
    def get_jalali_approved_at(self, obj):
        if obj.approved_at:
            return jdatetime.datetime.fromgregorian(datetime=obj.approved_at).strftime("%Y/%m/%d %H:%M")
        return "-"


# -------------------------------------------------------------------
# ادمین مسابقه
# -------------------------------------------------------------------

@admin.register(KyorugiCompetition)
class KyorugiCompetitionAdmin(admin.ModelAdmin):
    form = KyorugiCompetitionAdminForm

    list_display = (
        "title", "style_col", "age_category", "gender",
        "get_jalali_competition_date", "registration_open", "entry_fee",
    )
    search_fields = ("title", "public_id", "city", "address")
    filter_horizontal = ("belt_groups",)
    list_filter = (
        "gender", "age_category", "belt_level", "registration_open",
        ("competition_date", JDateFieldListFilter),
        ("registration_start", JDateFieldListFilter),
        ("registration_end", JDateFieldListFilter),
    )
    inlines = [MatAssignmentInline, CompetitionImageInline, CompetitionFileInline, CoachApprovalInline]
    readonly_fields = ("public_id",)
    ordering = ("-competition_date", "-id")
    fieldsets = (
        ("اطلاعات کلی", {
            "fields": ("title", "poster", "entry_fee", "age_category", "belt_level", "belt_groups", "gender")
        }),
        ("محل برگزاری", {"fields": ("city", "address")}),
        ("تاریخ‌ها", {"fields": ("registration_start", "registration_end", "weigh_date", "draw_date", "competition_date")}),
        ("تنظیمات مسابقه", {"fields": ("mat_count", "registration_open")}),
        ("تعهدنامه مربی", {"fields": ("terms_template",), "classes": ("collapse",)}),
        ("شناسه عمومی", {"fields": ("public_id",), "classes": ("collapse",)}),
    )

    @admin.display(description="تاریخ برگزاری (شمسی)")
    def get_jalali_competition_date(self, obj):
        if obj.competition_date:
            return jdatetime.date.fromgregorian(date=obj.competition_date).strftime("%Y/%m/%d")
        return "-"

    @admin.display(description="سبک")
    def style_col(self, obj):
        return getattr(obj, "style_display", "—")


# -------------------------------------------------------------------
# ادمین سن/کمربند/وزن
# -------------------------------------------------------------------
# ــــــ تنظیمات بازهٔ تاریخ برای دیت‌پیکر جلالی ــــــ
# بازه‌ی گسترده برای دیت‌پیکر جلالی + چند اتربیوت کمکی
JDP_RANGE_ATTRS = {
    "data-jdp": "",
    "data-jdp-min-date": "1300/01/01",
    "data-jdp-max-date": "1450/12/29",
    "autocomplete": "off",  # جلوگیری از اتوکامپلیت
}

def _to_greg(v):
    import jdatetime
    return v.togregorian() if isinstance(v, jdatetime.date) else v

class AgeCategoryAdminForm(forms.ModelForm):
    from_date = jforms.jDateField(
        widget=jadmin.widgets.AdminjDateWidget(attrs=JDP_RANGE_ATTRS)
    )
    to_date = jforms.jDateField(
        required=False,
        widget=jadmin.widgets.AdminjDateWidget(attrs=JDP_RANGE_ATTRS)
    )

    class Meta:
        model = AgeCategory
        fields = "__all__"

    def __init__(self, *args, **kwargs):
        # مقداردهی اولیهٔ جلالی برای ویرایش رکوردهای موجود
        super().__init__(*args, **kwargs)
        import datetime, jdatetime
        for name in ("from_date", "to_date"):
            v = getattr(self.instance, name, None)
            if not v:
                continue
            if isinstance(v, datetime.datetime):
                v = v.date()
            try:
                self.initial[name] = jdatetime.date.fromgregorian(date=v)
            except Exception:
                pass

    # تبدیل تاریخ‌های ورودی جلالی به میلادی پیش از ذخیره
    def clean_from_date(self):
        return _to_greg(self.cleaned_data.get("from_date"))

    def clean_to_date(self):
        return _to_greg(self.cleaned_data.get("to_date"))



@admin.register(AgeCategory)
class AgeCategoryAdmin(admin.ModelAdmin):
    form = AgeCategoryAdminForm
    list_display = ("name", "get_jalali_from_date", "get_jalali_to_date")
    search_fields = ("name",)
    ordering = ("from_date",)
    list_filter = (("from_date", JDateFieldListFilter), ("to_date", JDateFieldListFilter))

    @admin.display(description="از تاریخ تولد (شمسی)")
    def get_jalali_from_date(self, obj):
        if obj.from_date:
            return jdatetime.date.fromgregorian(date=obj.from_date).strftime("%Y/%m/%d")
        return "-"

    @admin.display(description="تا تاریخ تولد (شمسی)")
    def get_jalali_to_date(self, obj):
        if obj.to_date:
            return jdatetime.date.fromgregorian(date=obj.to_date).strftime("%Y/%m/%د")
        return "-"


@admin.register(Belt)
class BeltAdmin(admin.ModelAdmin):
    list_display = ("name",)
    search_fields = ("name",)


@admin.register(BeltGroup)
class BeltGroupAdmin(admin.ModelAdmin):
    list_display = ("label",)
    search_fields = ("label",)
    filter_horizontal = ("belts",)


@admin.register(WeightCategory)
class WeightCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "gender", "min_weight", "max_weight", "tolerance")
    list_filter = ("gender",)
    search_fields = ("name",)
    ordering = ("gender", "min_weight")


# -------------------------------------------------------------------
# تعهدنامه/تأیید مربی
# -------------------------------------------------------------------

@admin.register(TermsTemplate)
class TermsTemplateAdmin(admin.ModelAdmin):
    list_display = ("title",)
    search_fields = ("title",)


@admin.register(CoachApproval)
class CoachApprovalAdmin(admin.ModelAdmin):
    list_display = ("competition", "coach", "code", "terms_accepted", "is_active", "get_jalali_approved_at")
    list_filter = ("competition", "terms_accepted", "is_active")
    search_fields = (
        "competition__title", "code",
        "coach__first_name", "coach__last_name", "coach__phone", "coach__national_code",
    )
    raw_id_fields = ("competition", "coach")
    readonly_fields = ("approved_at",)

    @admin.display(description="تاریخ تأیید (شمسی)")
    def get_jalali_approved_at(self, obj):
        if obj.approved_at:
            return jdatetime.datetime.fromgregorian(datetime=obj.approved_at).strftime("%Y/%m/%d %H:%M")
        return "-"


# -------------------------------------------------------------------
# گزارش شرکت‌کنندگان (Proxy)
# -------------------------------------------------------------------

class KyorugiCompetitionParticipantsReport(KyorugiCompetition):
    class Meta:
        proxy = True
        verbose_name = "لیست شرکت‌کنندگان مسابقات"
        verbose_name_plural = "لیست شرکت‌کنندگان مسابقات"


@admin.register(KyorugiCompetitionParticipantsReport)
class ParticipantsReportAdmin(admin.ModelAdmin):
    change_list_template = "admin/competitions/participants_report.html"

    def has_add_permission(self, request): return False
    def has_change_permission(self, request, obj=None): return False
    def has_delete_permission(self, request, obj=None): return False

    def changelist_view(self, request, extra_context=None):
        from collections import OrderedDict
        form = ParticipantsReportForm(request.GET or None)

        selected_competition = None
        groups = []

        if form.is_valid():
            selected_competition = form.cleaned_data["competition"]
            qs = (
                Enrollment.objects
                .filter(competition=selected_competition)
                .select_related("player", "club", "coach", "belt_group", "weight_category")
                .order_by("belt_group__label", "weight_category__min_weight",
                          "player__last_name", "player__first_name")
            )

            grouped = OrderedDict()
            for e in qs:
                coach = e.coach
                e.coach_name = (
                    getattr(coach, "full_name", None)
                    or f"{(getattr(coach, 'first_name', '') or '').strip()} {(getattr(coach, 'last_name','') or '').strip()}".strip()
                    or ""
                )
                e.club_name = getattr(e.club, "name", "") or ""

                belt_label = getattr(e.belt_group, "label", "—")
                weight_label = getattr(e.weight_category, "name", "—")

                g = grouped.setdefault(belt_label, OrderedDict())
                g.setdefault(weight_label, []).append(e)

            groups = [(belt_label, list(weights.items())) for belt_label, weights in grouped.items()]

        ctx = dict(self.admin_site.each_context(request))
        ctx.update({
            "title": "لیست شرکت‌کنندگان مسابقات",
            "form": form,
            "selected_competition": selected_competition,
            "groups": groups,
        })
        if extra_context:
            ctx.update(extra_context)

        return TemplateResponse(request, self.change_list_template, ctx)


class ParticipantsReportForm(forms.Form):
    competition = forms.ModelChoiceField(
        queryset=KyorugiCompetition.objects.order_by("-competition_date", "-id"),
        label="مسابقه",
        required=True,
    )


# -------------------------------------------------------------------
# صفحه‌ی «شروع قرعه‌کشی» (Proxy: DrawStart)
# -------------------------------------------------------------------

class DrawStartForm(forms.Form):
    competition = forms.ModelChoiceField(
        label="مسابقه", queryset=KyorugiCompetition.objects.order_by("-competition_date", "-id")
    )
    belt_group = forms.ModelChoiceField(
        label="گروه کمربندی", queryset=BeltGroup.objects.none(), required=False
    )
    weight_category = forms.ModelChoiceField(
        label="رده وزنی", queryset=WeightCategory.objects.none(), required=False
    )

    # نماهای خودکار (فقط نمایش)
    auto_count = forms.IntegerField(label="شرکت‌کننده‌ها", required=False, disabled=True)
    auto_size  = forms.IntegerField(label="اندازهٔ پیشنهادی جدول", required=False, disabled=True)

    # تنظیمات دستی
    manual = forms.BooleanField(label="تنظیمات دستی", required=False)
    size_override = forms.IntegerField(
        label="اندازهٔ جدول (توان ۲)", required=False,
        help_text="خالی = خودکار. توان‌های ۲ مانند 2, 4, 8, 16, 32, 64…"
    )
    club_threshold = forms.IntegerField(
        label="آستانه هم‌باشگاهی", initial=8, required=False,
        help_text="اگر تعداد ≥ این مقدار باشد قانون هم‌باشگاهی در دور اول اعمال می‌شود."
    )
    seed = forms.CharField(label="Seed (اختیاری)", required=False)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        comp = self.data.get("competition") or self.initial.get("competition")
        if comp:
            try:
                comp = KyorugiCompetition.objects.get(pk=comp)
            except KyorugiCompetition.DoesNotExist:
                comp = None

        if comp:
            self.fields["belt_group"].queryset = comp.belt_groups.all()
        else:
            self.fields["belt_group"].queryset = BeltGroup.objects.none()

        wc_qs = WeightCategory.objects.none()
        if comp:
            allowed_ids = list(comp.mat_assignments.values_list("weights__id", flat=True))
            wc_qs = WeightCategory.objects.filter(id__in=allowed_ids, gender=comp.gender).order_by("min_weight")
        self.fields["weight_category"].queryset = wc_qs

        bg = self.data.get("belt_group") or self.initial.get("belt_group")
        wc = self.data.get("weight_category") or self.initial.get("weight_category")
        auto_count = 0
        auto_size = 1
        if comp and bg and wc:
            qs = Enrollment.objects.filter(
                competition=comp, belt_group_id=bg, weight_category_id=wc, status__in=ELIGIBLE_STATUSES
            )
            auto_count = qs.count()
            s = 1
            while s < max(auto_count, 1):
                s <<= 1
            auto_size = s
        self.fields["auto_count"].initial = auto_count
        self.fields["auto_size"].initial  = auto_size


@admin.register(DrawStart)
class DrawStartAdmin(admin.ModelAdmin):
    def has_add_permission(self, request): return False
    def has_change_permission(self, request, obj=None): return False
    def has_delete_permission(self, request): return False

    def changelist_view(self, request, extra_context=None):
        form = DrawStartForm(request.POST or request.GET or None)

        auto: dict = {"count": 0, "size": 1}
        comp = bg = wc = None
        draw = None
        use_draw = None
        matches_data = []

        if form.is_valid():
            comp = form.cleaned_data["competition"]
            bg   = form.cleaned_data.get("belt_group")
            wc   = form.cleaned_data.get("weight_category")
            seed = form.cleaned_data.get("seed") or ""

            count = (Enrollment.objects
                     .filter(competition=comp, belt_group=bg, weight_category=wc,
                             status__in=ELIGIBLE_STATUSES)
                     .count())
            size = 1
            while size < max(count, 1):
                size <<= 1
            auto = {"count": count, "size": size}

            if (request.GET.get("start") == "1") or (request.POST.get("start") == "1"):
                manual        = form.cleaned_data.get("manual") or False
                size_override = form.cleaned_data.get("size_override")
                ct_manual     = form.cleaned_data.get("club_threshold")

                final_size = (size_override if (manual and size_override) else size)
                final_th   = (ct_manual if (manual and ct_manual) else (8 if count >= 8 else 9999))

                if count < 1:
                    messages.error(request, "حداقل یک شرکت‌کننده لازم است.")
                else:
                    try:
                        draw = create_draw_for_group(
                            competition_id=comp.id,
                            age_category_id=comp.age_category_id,
                            belt_group_id=bg.id,
                            weight_category_id=wc.id,
                            club_threshold=int(final_th),
                            seed=seed,
                            size_override=final_size,
                        )
                        messages.success(request, "قرعه‌کشی انجام شد.")
                    except Exception as e:
                        messages.error(request, f"خطا در قرعه‌کشی: {e}")

        use_draw = draw or (
            (Draw.objects
             .filter(competition=comp,
                     gender=getattr(comp, "gender", None),
                     age_category=getattr(comp, "age_category", None),
                     belt_group=bg, weight_category=wc)
             .order_by("-created_at")
             .first()) if (comp and bg and wc) else None
        )

        if use_draw:
            qs = (Match.objects
                  .filter(draw=use_draw)
                  .select_related("player_a", "player_b")
                  .order_by("round_no", "slot_a"))
            for m in qs:
                matches_data.append({
                    "id": m.id,
                    "round_no": m.round_no,
                    "slot_a": m.slot_a,
                    "slot_b": m.slot_b,
                    "is_bye": bool(m.is_bye),
                    "player_a": _full_name(m.player_a),
                    "player_b": _full_name(m.player_b),
                })

        ctx = dict(self.admin_site.each_context(request))
        ctx.update({
            "title": "شروع قرعه‌کشی",
            "form": form,
            "auto": auto,
            "has_draw": bool(use_draw),
            "draw_size": (use_draw.size if use_draw else None),
            "show_bracket_now": bool(draw),
            "matches_json": json.dumps(matches_data, ensure_ascii=False),
        })
        if extra_context:
            ctx.update(extra_context)
        return TemplateResponse(request, "admin/competitions/draw_start.html", ctx)


def get_admin_urls(get_urls_fn):
    def my_urls():
        urls = get_urls_fn()
        extra = [
            path(
                "competitions/announce-results/",
                admin.site.admin_view(announce_results_view),
                name="announce-results",
            ),
        ]
        return extra + urls
    return my_urls

admin.site.get_urls = get_admin_urls(admin.site.get_urls)


@staff_member_required
def announce_results_view(request):
    comp_id = request.GET.get("competition") or request.POST.get("competition")
    competitions = KyorugiCompetition.objects.order_by("-id").only("id", "title", "gender")

    ctx = {
        "competitions": competitions,
        "selected_competition_id": int(comp_id) if comp_id and str(comp_id).isdigit() else None,
        "csrf_token": get_token(request),
    }

    if not (comp_id and str(comp_id).isdigit()):
        return render(request, "admin/competitions/announce_results.html", ctx)

    comp = KyorugiCompetition.objects.get(id=int(comp_id))
    allowed_ids = comp.allowed_weight_ids() or []
    weights = WeightCategory.objects.filter(id__in=allowed_ids, gender=comp.gender).order_by("min_weight")

    by_weight = {w.id: list(
        Enrollment.objects.filter(competition=comp, weight_category=w)
        .select_related("player")
        .order_by("player__first_name", "player__last_name")
    ) for w in weights}

    existing = {r.weight_category_id: r for r in KyorugiResult.objects.filter(competition=comp)}

    if request.method == "POST" and request.POST.get("confirm") == "yes":
        for w in weights:
            def _get_enr(field):
                val = request.POST.get(f"w_{w.id}_{field}")
                return Enrollment.objects.filter(id=val).first() if val and val.isdigit() else None

            gold    = _get_enr("gold")
            silver  = _get_enr("silver")
            bronze1 = _get_enr("bronze1")
            bronze2 = _get_enr("bronze2")

            if not any([gold, silver, bronze1, bronze2]):
                continue

            res = existing.get(w.id) or KyorugiResult(competition=comp, weight_category=w, created_by=request.user)
            res.gold_enrollment    = gold
            res.silver_enrollment  = silver
            res.bronze1_enrollment = bronze1
            res.bronze2_enrollment = bronze2
            res.save()
            existing[w.id] = res

            apply_results_and_points(res)

        return redirect(f"{request.path}?competition={comp.id}&saved=1")

    rows = []
    for w in weights:
        enrs = by_weight[w.id]
        res  = existing.get(w.id)
        rows.append({
            "weight": w,
            "enrollments": [{"id": str(e.id), "label": f"{e.player.first_name} {e.player.last_name} — کد:{e.player_id}"} for e in enrs],
            "prefill": {
                "gold":    str(getattr(getattr(res, "gold_enrollment",   None), "id", "") or ""),
                "silver":  str(getattr(getattr(res, "silver_enrollment", None), "id", "") or ""),
                "bronze1": str(getattr(getattr(res, "bronze1_enrollment",None), "id", "") or ""),
                "bronze2": str(getattr(getattr(res, "bronze2_enrollment",None), "id", "") or ""),
            }
        })

    ctx.update({"competition": comp, "weights": rows, "saved": request.GET.get("saved") == "1"})
    return render(request, "admin/competitions/announce_results.html", ctx)


class AnnounceResultsProxy(KyorugiCompetition):
    class Meta:
        proxy = True
        verbose_name = "اعلام نتایج"
        verbose_name_plural = "اعلام نتایج"


@admin.register(AnnounceResultsProxy)
class AnnounceResultsProxyAdmin(admin.ModelAdmin):
    def has_add_permission(self, request): return False
    def has_change_permission(self, request, obj=None): return False
    def has_delete_permission(self, request): return False

    def changelist_view(self, request, extra_context=None):
        return redirect(reverse("admin:announce-results"))





# ---------- فرم صفحه شماره‌گذاری ----------
class MatchNumberingForm(forms.Form):
    competition = forms.ModelChoiceField(
        label="مسابقه",
        queryset=KyorugiCompetition.objects.order_by("-competition_date", "-id"),
        required=True,
    )
    weights = forms.ModelMultipleChoiceField(
        label="اوزانی که قرعه‌کشی شده‌اند",
        queryset=WeightCategory.objects.none(),
        required=True,
        help_text="فقط اوزانی را انتخاب کن که برایشان قرعه ساخته‌ای."
    )
    reset_old = forms.BooleanField(label="پاک کردن شماره‌های قبلی", required=False, initial=True)
    do_apply  = forms.BooleanField(label="اعمال شماره‌گذاری", required=False, initial=False)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        comp = None
        # تلاش از data -> initial
        comp_id = self.data.get("competition") or self.initial.get("competition")
        if comp_id:
            try:
                comp = KyorugiCompetition.objects.get(pk=comp_id)
            except KyorugiCompetition.DoesNotExist:
                comp = None

        # وزن‌های مجاز از روی تخصیص زمین + جنسیت مسابقه
        wc_qs = WeightCategory.objects.none()
        if comp:
            allowed_ids = list(comp.mat_assignments.values_list("weights__id", flat=True))
            wc_qs = WeightCategory.objects.filter(id__in=allowed_ids, gender=comp.gender).order_by("min_weight")
        self.fields["weights"].queryset = wc_qs


# ---------- View ادمین ----------
# ---------- View ادمین ----------
def numbering_view(request):
    """/admin/competitions/numbering/"""
    form = MatchNumberingForm(request.POST or request.GET or None)

    ctx = {**admin.site.each_context(request)}
    ctx.update({"title": "شماره‌گذاری بازی‌ها", "form": form, "mats_map": None, "brackets": []})

    if not form.is_valid():
        return TemplateResponse(request, "admin/competitions/match_numbering.html", ctx)

    comp: KyorugiCompetition = form.cleaned_data["competition"]
    weights_qs = form.cleaned_data["weights"]
    weight_ids = list(weights_qs.values_list("id", flat=True))
    reset_old = form.cleaned_data.get("reset_old") or False
    do_apply  = form.cleaned_data.get("do_apply")  or False

    # اگر فقط پاک‌سازی خواستی و اعمال نزدی
    if reset_old and not do_apply:
        clear_match_numbers_for_competition(comp.id, weight_ids)
        messages.warning(request, "شماره‌های قبلی پاک شد.")

    # اعمال شماره‌گذاری
    if do_apply:
        try:
            number_matches_for_competition(comp.id, weight_ids, clear_prev=reset_old)
            messages.success(request, "شماره‌گذاری با موفقیت انجام شد.")
        except Exception as e:
            messages.error(request, f"خطا در شماره‌گذاری: {e}")

    # نقشهٔ وزن→زمین برای نمایش بالای صفحه
    mats_map = []
    for ma in comp.mat_assignments.all().prefetch_related("weights"):
        ws = [w.name for w in ma.weights.filter(id__in=weight_ids).order_by("min_weight")]
        if ws:
            mats_map.append((ma.mat_number, ws))
    ctx["mats_map"] = mats_map

    # ساخت دادهٔ براکت‌ها
    draws = (
        Draw.objects
        .filter(competition=comp, weight_category_id__in=weight_ids)
        .select_related("belt_group", "weight_category")
        .order_by("weight_category__min_weight", "id")
    )

    brackets = []
    for dr in draws:
        # همه‌ی مسابقه‌ها
        ms = (
            Match.objects
            .filter(draw=dr)
            .select_related("player_a", "player_b")
            .order_by("round_no", "slot_a", "id")
        )

        matches_json = []
        for m in ms:
            matches_json.append({
                "id": m.id,
                "round_no": m.round_no,
                "slot_a": m.slot_a,
                "slot_b": m.slot_b,
                "is_bye": bool(m.is_bye),
                "player_a": (getattr(m.player_a, "full_name", None)
                             or f"{getattr(m.player_a,'first_name','')} {getattr(m.player_a,'last_name','')}".strip()
                             or ""),
                "player_b": (getattr(m.player_b, "full_name", None)
                             or f"{getattr(m.player_b,'first_name','')} {getattr(m.player_b,'last_name','')}".strip()
                             or ""),
                "match_number": m.match_number,  # کلید درست
            })

        # زمین مرتبط با این وزن (همیشه مقداردهی کن حتی اگر None باشد)
        mat_no = None
        for ma in comp.mat_assignments.all().prefetch_related("weights"):
            if ma.weights.filter(id=dr.weight_category_id).exists():
                mat_no = ma.mat_number
                break

        brackets.append({
            "title": comp.title,
            "belt": getattr(dr.belt_group, "label", "—"),
            "weight": getattr(dr.weight_category, "name", "—"),
            "mat_no": mat_no,
            "date_j": _to_jalali_str(comp.competition_date),
            "size": getattr(dr, "size", 0) or 0,
            # حتما JSON رشته‌ای بده تا در تمپلیت سالم پارس شود
            "matches_json": json.dumps(matches_json, ensure_ascii=False),
        })

    ctx["brackets"] = brackets
    ctx["board_logo_url"] = getattr(settings, "BOARD_LOGO_URL", None)
    return TemplateResponse(request, "admin/competitions/match_numbering.html", ctx)



# ---------- ثبت URL در ادمین ----------
def _inject_numbering_url(get_urls_fn):
    def wrapper():
        urls = get_urls_fn()
        extra = [
            path(
                "competitions/numbering/",
                admin.site.admin_view(numbering_view),
                name="competitions_match_numbering",
            )
        ]
        return extra + urls
    return wrapper

admin.site.get_urls = _inject_numbering_url(admin.site.get_urls)


#-------------------------------------------------------------سمینار----------------------------------------------------------------------------
# admin.py

# ---------------- Helpers ----------------
def _jdate_to_greg(v):
    """jdatetime.date -> datetime.date (Gregorian)."""
    return v.togregorian() if isinstance(v, jdatetime.date) else v

def _greg_to_jalali_str(val):
    """date|datetime -> 'YYYY/MM/DD' (jalali) or ''."""
    if not val:
        return ""
    try:
        if isinstance(val, _dt.datetime):
            if timezone.is_aware(val):
                val = timezone.localtime(val)
            val = val.date()
        j = jdatetime.date.fromgregorian(date=val)
        return j.strftime("%Y/%m/%d")
    except Exception:
        return ""


# ---------------- Seminar Form ----------------
class SeminarAdminForm(forms.ModelForm):
    registration_start = jforms.jDateField(label="شروع ثبت‌نام", widget=jadmin.widgets.AdminjDateWidget)
    registration_end   = jforms.jDateField(label="پایان ثبت‌نام", widget=jadmin.widgets.AdminjDateWidget)
    event_date         = jforms.jDateField(label="تاریخ برگزاری", widget=jadmin.widgets.AdminjDateWidget)

    allowed_roles = forms.MultipleChoiceField(
        label="نقش‌های مجاز",
        choices=Seminar.ROLE_CHOICES,
        required=False,
        widget=forms.CheckboxSelectMultiple,
        help_text="خالی = همه نقش‌ها",
    )

    class Meta:
        model = Seminar
        fields = [
            "title", "poster", "description", "fee", "location",
            "registration_start", "registration_end", "event_date",
            "allowed_roles",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        inst: Seminar | None = getattr(self, "instance", None)
        if not self.is_bound and inst and inst.pk:
            for name in ("registration_start", "registration_end", "event_date"):
                val = getattr(inst, name, None)
                if not val:
                    continue
                if isinstance(val, _dt.datetime):
                    if timezone.is_aware(val):
                        val = timezone.localtime(val)
                    val = val.date()
                try:
                    self.initial[name] = jdatetime.date.fromgregorian(date=val)
                except Exception:
                    pass
            self.initial["allowed_roles"] = inst.allowed_roles or []

    def clean_registration_start(self): return _jdate_to_greg(self.cleaned_data.get("registration_start"))
    def clean_registration_end(self):   return _jdate_to_greg(self.cleaned_data.get("registration_end"))
    def clean_event_date(self):         return _jdate_to_greg(self.cleaned_data.get("event_date"))

    def save(self, commit=True):
        inst: Seminar = super().save(commit=False)
        inst.allowed_roles = self.cleaned_data.get("allowed_roles") or []
        if commit:
            inst.save()
        return inst


# ---------------- Seminar Admin ----------------

class SeminarAdmin(admin.ModelAdmin):
    """
    مدیریت سمینارها + نمای سفارشی لیست شرکت‌کنندگان
    """
    form = SeminarAdminForm
    change_form_template = "admin/competitions/poomsae/change_form.html"  # تمپلیت ساده با یک دکمه اضافه

    def get_urls(self):
        urls = super().get_urls()
        custom = [
            path(
                "<int:pk>/build-divisions/",
                self.admin_site.admin_view(self.build_divisions_view),
                name="competitions_poomsae_build_divisions",
            ),
        ]
        return custom + urls

    def build_divisions_view(self, request, pk: int):
        created = build_poomsae_divisions_for_competition(pk)
        messages.success(request, f"{created} دیویژن جدید ساخته شد.")
        return redirect(f"../change/")
    # لیست سمینارها
    list_display = (
        "title",
        "registration_start_shamsi",
        "registration_end_shamsi",
        "event_date_shamsi",
        "fee",
        "allowed_roles_disp",
        "registrations_count_link",  # ← لینک به صفحهٔ شرکت‌کنندگان همان سمینار
    )
    list_display_links = ("title",)
    list_per_page = 25
    search_fields = ("title", "location")
    list_filter = (
        ("event_date", JDateFieldListFilter),
        ("registration_start", JDateFieldListFilter),
        ("registration_end", JDateFieldListFilter),
    )
    readonly_fields = ("created_at",)
    fieldsets = (
        ("اطلاعات اصلی", {"fields": ("title", "poster", "description", "fee", "location")}),
        ("زمان‌بندی (شمسی)", {"fields": ("registration_start", "registration_end", "event_date")}),
        ("دسترسی", {"fields": ("allowed_roles",)}),
        ("سیستمی", {"fields": ("created_at",), "classes": ("collapse",)}),
    )

    # ستون‌های تاریخ به شمسی
    @admin.display(description="تاریخ برگزاری (شمسی)", ordering="event_date")
    def event_date_shamsi(self, obj: Seminar):
        return _greg_to_jalali_str(obj.event_date)

    @admin.display(description="شروع ثبت‌نام (شمسی)", ordering="registration_start")
    def registration_start_shamsi(self, obj: Seminar):
        return _greg_to_jalali_str(obj.registration_start)

    @admin.display(description="پایان ثبت‌نام (شمسی)", ordering="registration_end")
    def registration_end_shamsi(self, obj: Seminar):
        return _greg_to_jalali_str(obj.registration_end)

    # نمایش نقش‌ها به‌صورت خوانا
    def allowed_roles_disp(self, obj: Seminar):
        return obj.allowed_roles_display()
    allowed_roles_disp.short_description = "نقش‌های مجاز"

    @admin.display(description="تعداد ثبت‌نام")
    def registrations_count_link(self, obj: Seminar):
        url = reverse("admin:competitions_seminar_participants")
        url = f"{url}?seminar={obj.pk}"
        count = obj.registrations.count()
        return format_html('<a class="button" href="{}">{}</a>', url, count)

    # --------- URL سفارشی صفحهٔ شرکت‌کنندگان ---------
    def get_urls(self):
        urls = super().get_urls()
        custom = [
            path(
                "participants/",
                self.admin_site.admin_view(self.participants_view),
                name="competitions_seminar_participants",
            ),
        ]
        return custom + urls

    # نمای لیست شرکت‌کنندگان سمینار (تمپلیت: admin/competitions/seminar/participants_changelist.html)
    def participants_view(self, request):
        seminars = Seminar.objects.order_by("-event_date", "-id")
        sel = request.GET.get("seminar")
        rows, selected = [], None

        if sel:
            try:
                selected = seminars.get(pk=int(sel))
            except Exception:
                selected = None

            if selected:
                qs = (
                    SeminarRegistration.objects
                    .filter(seminar=selected)
                    .select_related("user", "user__profile")
                    .order_by("id")
                )
                # نقش‌های فارسی
                mapping = dict(Seminar.ROLE_CHOICES)  # {'player':'بازیکن','coach':'مربی','referee':'داور'}

                for i, r in enumerate(qs, 1):
                    prof = getattr(r.user, "profile", None)

                    # نام کامل
                    full_name = (
                        ((getattr(prof, "first_name", "") + " " + getattr(prof, "last_name", "")).strip())
                        or (getattr(r.user, "get_full_name", lambda: "")() or str(r.user))
                    )
                    # کدملی و کمربند
                    nid   = (getattr(prof, "national_code", "") or "").strip()
                    belt  = (getattr(prof, "belt_grade", "") or "").strip()

                    # موبایل: اول phone خود ثبت‌نام، بعد phone پروفایل
                    mobile = (r.phone or getattr(prof, "phone", "") or "").strip() or "—"

                    # نقش‌ها فارسی
                    roles_fa = "، ".join(mapping.get(x, x) for x in (r.roles or [])) or "—"

                    rows.append({
                        "idx": i,
                        "full_name": full_name or "—",
                        "nid": nid or "—",
                        "belt": belt or "—",
                        "roles_fa": roles_fa,
                        "mobile": mobile,
                        "paid": "بله" if r.is_paid else "خیر",
                        "amount": r.paid_amount or 0,
                    })

        ctx = {
            **self.admin_site.each_context(request),
            "title": "لیست شرکت‌کنندگان سمینارها",
            "seminars": seminars,
            "selected": selected,
            "rows": rows,
        }
        return render(request, "admin/competitions/seminar/participants_changelist.html", ctx)


# ---------------- Proxy: لیست شرکت‌کنندگان ----------------
class SeminarAttendee(SeminarRegistration):
    class Meta:
        proxy = True
        verbose_name = "لیست شرکت‌کنندگان سمینارها"
        verbose_name_plural = "لیست شرکت‌کنندگان سمینارها"


# ------------- Action: CSV Export -------------
@admin.action(description="خروجی CSV")
def export_csv(modeladmin, request, queryset):
    import csv
    from django.http import HttpResponse

    resp = HttpResponse(content_type="text/csv; charset=utf-8")
    resp["Content-Disposition"] = 'attachment; filename="seminar_attendees.csv"'
    w = csv.writer(resp)
    w.writerow([
        "Seminar", "User", "Full name", "National code",
        "Belt", "Phone", "Roles", "Paid", "Amount", "Paid At", "Created At"
    ])
    mapping = dict(Seminar.ROLE_CHOICES)

    qs = queryset.select_related("seminar", "user", "user__profile")
    for r in qs:
        p = getattr(r.user, "profile", None)
        full_name = (f"{getattr(p, 'first_name', '')} {getattr(p, 'last_name', '')}".strip()
                     if p else (getattr(r.user, "get_full_name", lambda: str(r.user))()))
        nid = getattr(p, "national_code", "") if p else ""
        belt = getattr(p, "belt_grade", "") if p else ""
        roles = "، ".join(mapping.get(x, x) for x in (r.roles or []))
        w.writerow([
            str(r.seminar), str(r.user), full_name, nid, belt, r.phone or "",
            "Yes" if r.is_paid else "No", r.paid_amount, r.paid_at or "", r.created_at
        ])
    return resp


# ---------------- Admin: صفحهٔ مستقل شرکت‌کنندگان ----------------
@admin.register(SeminarAttendee)
class SeminarAttendeeAdmin(admin.ModelAdmin):

    change_list_template = "admin/competitions/seminar/participants_changelist.html"
    actions = [export_csv]

    # این صفحه فقط نمایش/اکسپورت است
    def has_add_permission(self, request): return False
    def has_change_permission(self, request, obj=None): return False
    def has_delete_permission(self, request, obj=None): return False

    def changelist_view(self, request, extra_context=None):
        # لیست سمینارها برای دراپ‌داون
        seminars = Seminar.objects.all().order_by("-event_date", "-created_at")

        # سمینار انتخاب‌شده از querystring
        selected = request.GET.get("seminar") or ""
        regs = []
        selected_obj = None
        if selected:
            regs = (SeminarRegistration.objects
                    .select_related("seminar", "user", "user__profile")
                    .filter(seminar_id=selected)
                    .order_by("-created_at"))
            selected_obj = Seminar.objects.filter(id=selected).first()

        ctx = {
            **self.admin_site.each_context(request),
            "title": "لیست شرکت‌کنندگان سمینارها",
            "seminars": seminars,
            "selected_id": int(selected) if str(selected).isdigit() else "",
            "selected_seminar": selected_obj,
            "registrations": regs,
            "role_map": dict(Seminar.ROLE_CHOICES),
        }
        if extra_context:
            ctx.update(extra_context)
        return TemplateResponse(request, self.change_list_template, ctx)


# ---------------- Register / Unregister ----------------
try:
    admin.site.unregister(Seminar)
except admin.sites.NotRegistered:
    pass
admin.site.register(Seminar, SeminarAdmin)

# مدل اصلی را از منو حذف می‌کنیم تا فقط صفحهٔ مستقل نمایش داده شود
try:
    admin.site.unregister(SeminarRegistration)
except admin.sites.NotRegistered:
    pass
# پروکسی با @admin.register بالا ثبت شده است
# ==================================================================== مسابقه پومسه ==========================================================

class PoomsaeCoachApprovalInline(admin.TabularInline):
    model = PoomsaeCoachApproval
    extra = 0
    fields = ("coach", "code", "terms_accepted", "is_active", "approved_at")
    readonly_fields = ("code", "approved_at")

class PoomsaeCompetitionAdminForm(forms.ModelForm):
    registration_start = jforms.jDateField(widget=jadmin.widgets.AdminjDateWidget)
    registration_end   = jforms.jDateField(widget=jadmin.widgets.AdminjDateWidget)
    draw_date          = jforms.jDateField(required=False, widget=jadmin.widgets.AdminjDateWidget)
    competition_date   = jforms.jDateField(widget=jadmin.widgets.AdminjDateWidget)

    class Meta:
        model = PoomsaeCompetition
        fields = "__all__"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        _init_jalali(self, ["registration_start", "registration_end", "draw_date", "competition_date"])

    def clean_registration_start(self): return _to_greg(self.cleaned_data.get("registration_start"))
    def clean_registration_end(self):   return _to_greg(self.cleaned_data.get("registration_end"))
    def clean_draw_date(self):          return _to_greg(self.cleaned_data.get("draw_date"))
    def clean_competition_date(self):   return _to_greg(self.cleaned_data.get("competition_date"))


class PoomsaeImageInline(admin.TabularInline):
    model = PoomsaeImage
    extra = 1
    verbose_name = "تصویر"
    verbose_name_plural = "تصاویر پیوست"


class PoomsaeFileInline(admin.TabularInline):
    model = PoomsaeFile
    extra = 1
    verbose_name = "فایل PDF"
    verbose_name_plural = "فایل‌های پیوست"


@admin.register(PoomsaeCompetition)
class PoomsaeCompetitionAdmin(admin.ModelAdmin):
    form = PoomsaeCompetitionAdminForm

    list_display = ("title", "style_col", "gender", "get_jalali_competition_date", "registration_open", "entry_fee")
    search_fields = ("title", "public_id", "city", "address")
    list_filter = (
        "gender",
        "belt_level",
        "registration_open",
        ("competition_date", JDateFieldListFilter),
        ("registration_start", JDateFieldListFilter),
        ("registration_end", JDateFieldListFilter),
        # اگر خواستی: "age_categories" را هم می‌توانی فیلتر بذاری (اما روی M2M ممکن است UI شلوغ شود)
    )
    filter_horizontal = ("belt_groups", "age_categories")  # ⬅️ هر دو چندانتخابی
    inlines = [PoomsaeImageInline, PoomsaeFileInline,PoomsaeCoachApprovalInline]
    readonly_fields = ("public_id", "created_at")
    ordering = ("-competition_date", "-id")
    fieldsets = (
        ("اطلاعات کلی", {
            "fields": ("title", "poster", "entry_fee", "belt_level", "belt_groups", "age_categories", "gender")
        }),
        ("محل برگزاری", {"fields": ("city", "address")}),
        ("تاریخ‌ها", {"fields": ("registration_start", "registration_end", "draw_date", "competition_date")}),
        ("تنظیمات مسابقه", {"fields": ("registration_open",)}),
        ("شناسه/سیستمی", {"fields": ("public_id", "created_at"), "classes": ("collapse",)}),
        ("تعهدنامهٔ مربی", {
            "fields": ("terms_template",),
        }),
    )

    @admin.display(description="تاریخ برگزاری (شمسی)")
    def get_jalali_competition_date(self, obj):
        if obj.competition_date:
            return jdatetime.date.fromgregorian(date=obj.competition_date).strftime("%Y/%m/%d")
        return "-"

    @admin.display(description="سبک")
    def style_col(self, obj):
        return getattr(obj, "style_display", "—")
