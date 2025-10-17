# -*- coding: utf-8 -*-
from __future__ import annotations

import datetime as _dt
import datetime
import json
from collections import OrderedDict

from django.contrib.admin.views.decorators import staff_member_required
from django import forms
from django.conf import settings
from django.contrib import admin, messages
from django.core.exceptions import PermissionDenied
from django.db import IntegrityError, transaction
from django.middleware.csrf import get_token
from django.shortcuts import redirect, render
from django.template.response import TemplateResponse
from django.templatetags.static import static
from django.urls import path, reverse
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from django.utils.html import format_html
from django.http import HttpResponseBadRequest, HttpResponseRedirect
from django.db.models import Q

import jdatetime
import django_jalali.forms as jforms
import django_jalali.admin as jadmin
from django_jalali.admin.filters import JDateFieldListFilter

# ============================ مدل‌ها ============================
from .models import (
    AgeCategory, Belt, BeltGroup, WeightCategory,
    KyorugiCompetition, CompetitionImage, CompetitionFile, MatAssignment,
    CoachApproval, TermsTemplate, Enrollment, Draw, Match, DrawStart, KyorugiResult,
    Seminar, SeminarRegistration,
    # --- پومسه ---
    PoomsaeCompetition, PoomsaeDivision, PoomsaeCoachApproval, PoomsaeEntry,
)

# سرویس‌ها
from .services.draw_service import create_draw_for_group
from .services.results_service import apply_results_and_points
from competitions.services.numbering_service import (
    number_matches_for_competition,
    clear_match_numbers_for_competition,
)

ELIGIBLE_STATUSES = ("paid", "confirmed", "accepted", "completed")

# ---- سه‌حالتیِ امن برای True/False/None
class TriStateChoiceField(forms.TypedChoiceField):
    def __init__(self, *args, **kwargs):
        super().__init__(
            choices=(
                ("",  "طبق تاریخ‌ها"),  # None
                ("1", "اجباراً باز"),   # True
                ("0", "اجباراً بسته"),  # False
            ),
            coerce=lambda v: True if v == "1" else (False if v == "0" else None),
            required=False,
            *args, **kwargs
        )

def _to_greg(v):
    """jdatetime.date|datetime -> معادل میلادی؛ یا همان ورودی اگر لازم نبود."""
    if isinstance(v, jdatetime.datetime):
        return v.togregorian()
    if isinstance(v, jdatetime.date):
        return v.togregorian()
    return v

def _init_jalali(form, field_names):
    """مقداردهی اولیهٔ فیلدهای جلالی با مقادیر مدل (Date/DateTime ← jdatetime)."""
    for name in field_names:
        v = form.initial.get(name) or getattr(form.instance, name, None)
        if not v:
            continue
        try:
            if isinstance(v, datetime.datetime):
                if timezone.is_aware(v):
                    v = timezone.localtime(v)
                form.initial[name] = jdatetime.datetime.fromgregorian(datetime=v)
            elif isinstance(v, datetime.date):
                form.initial[name] = jdatetime.date.fromgregorian(date=v)
        except Exception:
            pass

def _to_jalali_str(value):
    """گرگوری → رشتهٔ شمسی YYYY/MM/DD (برای نمایش)."""
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

def _to_jalali_dt_str(val):
    """گرگوری → رشتهٔ شمسی YYYY/MM/DD HH:MM"""
    if not val:
        return "—"
    try:
        if isinstance(val, datetime.datetime):
            if timezone.is_aware(val):
                val = timezone.localtime(val)
            gdt = val
        elif isinstance(val, datetime.date):
            gdt = datetime.datetime.combine(val, datetime.time(0, 0))
        else:
            dt = parse_datetime(str(val)) or parse_date(str(val))
            if not dt:
                return "—"
            if isinstance(dt, datetime.date) and not isinstance(dt, datetime.datetime):
                gdt = datetime.datetime.combine(dt, datetime.time(0, 0))
            else:
                gdt = dt
        jdt = jdatetime.datetime.fromgregorian(datetime=gdt)
        return jdt.strftime("%Y/%m/%d %H:%M")
    except Exception:
        return "—"

def _full_name(u):
    if not u:
        return None
    for a in ("full_name", "name"):
        v = getattr(u, a, None)
        if v:
            return v
    fn = (getattr(u, "first_name", "") or "").strip()
    ln = (getattr(u, "last_name", "") or "").strip()
    return (fn + " " + ln).strip() or getattr(u, "username", None)

def _logo_url():
    url = getattr(settings, "BOARD_LOGO_URL", None)
    return url or static("img/board-logo.png")

# ============================ Kyorugi ============================

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

        if "registration_manual" in self.fields:
            current = getattr(self.instance, "registration_manual", None)
            self.fields["registration_manual"] = TriStateChoiceField(label="فعال بودن ثبت‌نام")
            if not self.is_bound:
                self.initial["registration_manual"] = (
                    "" if current is None else ("1" if current is True else "0")
                )
            self.fields["registration_manual"].help_text = "خالی=طبق تاریخ‌ها، بله=اجباراً باز، خیر=اجباراً بسته"

    def clean_registration_start(self): return _to_greg(self.cleaned_data.get("registration_start"))
    def clean_registration_end(self):   return _to_greg(self.cleaned_data.get("registration_end"))
    def clean_weigh_date(self):         return _to_greg(self.cleaned_data.get("weigh_date"))
    def clean_draw_date(self):          return _to_greg(self.cleaned_data.get("draw_date"))
    def clean_competition_date(self):   return _to_greg(self.cleaned_data.get("competition_date"))

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

@admin.display(description="تاریخ برگزاری (شمسی)")
def _comp_date_jalali(obj):
    if obj.competition_date:
        return jdatetime.date.fromgregorian(date=obj.competition_date).strftime("%Y/%m/%d")
    return "-"

@admin.display(boolean=True, description="جدول منتشر؟")
def _is_bracket_published(obj):
    return bool(getattr(obj, "bracket_published_at", None))

@admin.display(description="سبک")
def _style_col(obj):
    return getattr(obj, "style_display", "—")

@admin.display(boolean=True, description="ثبت‌نام باز؟")
def _registration_open_col(obj):
    return bool(getattr(obj, "registration_open_effective", False))

@admin.register(KyorugiCompetition)
class KyorugiCompetitionAdmin(admin.ModelAdmin):
    form = KyorugiCompetitionAdminForm

    list_display = (
        "title", _style_col, "age_category", "gender",
        _comp_date_jalali, _registration_open_col, "registration_manual",
        "entry_fee", _is_bracket_published,
    )
    search_fields = ("title", "public_id", "city", "address")
    filter_horizontal = ("belt_groups",)
    list_filter = (
        "gender", "age_category", "belt_level",
        "registration_manual",
        ("competition_date", JDateFieldListFilter),
        ("registration_start", JDateFieldListFilter),
        ("registration_end", JDateFieldListFilter),
    )
    actions = []
    inlines = [MatAssignmentInline, CompetitionImageInline, CompetitionFileInline, CoachApprovalInline]
    readonly_fields = ("public_id",)
    ordering = ("-competition_date", "-id")
    fieldsets = (
        ("اطلاعات کلی", {
            "fields": ("title", "poster", "entry_fee", "age_category", "belt_level", "belt_groups", "gender")
        }),
        ("محل برگزاری", {"fields": ("city", "address")}),
        ("تاریخ‌ها",
         {"fields": ("registration_start", "registration_end", "weigh_date", "draw_date", "competition_date")}),
        ("ثبت‌نام", {"fields": ("mat_count", "registration_manual"),
                     "description": "خالی=طبق تاریخ‌ها، تیک=اجباراً باز، بدون تیک=اجباراً بسته"}),
        ("تعهدنامه مربی", {"fields": ("terms_template",), "classes": ("collapse",)}),
        ("شناسه عمومی", {"fields": ("public_id",), "classes": ("collapse",)}),
    )

# ============================ سن/کمربند/وزن ============================

@admin.register(AgeCategory)
class AgeCategoryAdmin(admin.ModelAdmin):
    class _Form(forms.ModelForm):
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

    form = _Form
    list_display = ("name", "get_jalali_from_date", "get_jalali_to_date")
    search_fields = ("name",)
    ordering = ("from_date",)
    list_filter = (("from_date", JDateFieldListFilter), ("to_date", JDateFieldListFilter))

    @admin.display(description="از تاریخ تولد (شمسی)")
    def get_jalali_from_date(self, obj):
        return _to_jalali_str(obj.from_date)

    @admin.display(description="تا تاریخ تولد (شمسی)")
    def get_jalali_to_date(self, obj):
        return _to_jalali_str(obj.to_date)

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

# ============================ تعهدنامه/تأیید مربی (Kyorugi) ============================

@admin.register(TermsTemplate)
class TermsTemplateAdmin(admin.ModelAdmin):
    list_display = ("title",)
    search_fields = ("title",)

# ============================ گزارش شرکت‌کنندگان (Kyorugi) ============================

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

# ============================ شروع قرعه‌کشی (Kyorugi) ============================

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

    auto_count = forms.IntegerField(label="شرکت‌کننده‌ها", required=False, disabled=True)
    auto_size  = forms.IntegerField(label="اندازهٔ پیشنهادی جدول", required=False, disabled=True)

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

# ---------- شماره‌گذاری بازی‌ها ----------

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
        comp_id = self.data.get("competition") or self.initial.get("competition")
        if comp_id:
            try:
                comp = KyorugiCompetition.objects.get(pk=comp_id)
            except KyorugiCompetition.DoesNotExist:
                comp = None

        wc_qs = WeightCategory.objects.none()
        if comp:
            allowed_ids = list(comp.mat_assignments.values_list("weights__id", flat=True))
            wc_qs = WeightCategory.objects.filter(id__in=allowed_ids, gender=comp.gender).order_by("min_weight")
        self.fields["weights"].queryset = wc_qs

def numbering_view(request):
    form = MatchNumberingForm(request.POST or request.GET or None)

    ctx = {**admin.site.each_context(request)}
    ctx.update({"title": "شماره‌گذاری بازی‌ها", "form": form, "mats_map": None, "brackets": [], "is_bracket_published": False})

    # برای نمایش دکمه‌ها حتی وقتی فرم نامعتبره
    selected_competition_id = None
    raw_comp = (request.POST.get("competition") or request.GET.get("competition") or "").strip()
    if raw_comp.isdigit():
        selected_competition_id = int(raw_comp)

    is_published = False
    if selected_competition_id:
        comp_pub = KyorugiCompetition.objects.filter(pk=selected_competition_id)\
                                             .only("bracket_published_at").first()
        is_published = bool(getattr(comp_pub, "bracket_published_at", None))

    if not form.is_valid():
        ctx["selected_competition_id"] = selected_competition_id
        ctx["is_bracket_published"] = is_published
        return TemplateResponse(request, "admin/competitions/match_numbering.html", ctx)

    # از اینجا فرم معتبره
    comp: KyorugiCompetition = form.cleaned_data["competition"]
    ctx["selected_competition_id"] = comp.id
    ctx["is_bracket_published"] = bool(getattr(comp, "bracket_published_at", None))

    weights_qs = form.cleaned_data["weights"]
    weight_ids = list(weights_qs.values_list("id", flat=True))
    reset_old = bool(form.cleaned_data.get("reset_old"))
    do_apply  = bool(form.cleaned_data.get("do_apply"))

    if reset_old and not do_apply:
        clear_match_numbers_for_competition(comp.id, weight_ids)
        messages.warning(request, "شماره‌های قبلی پاک شد.")

    if do_apply:
        try:
            number_matches_for_competition(comp.id, weight_ids, clear_prev=reset_old)
            messages.success(request, "شماره‌گذاری با موفقیت انجام شد.")
        except Exception as e:
            messages.error(request, f"خطا در شماره‌گذاری: {e}")

    # نقشه‌ی زمین‌ها
    mats_map = []
    for ma in comp.mat_assignments.all().prefetch_related("weights"):
        ws = [w.name for w in ma.weights.filter(id__in=weight_ids).order_by("min_weight")]
        if ws:
            mats_map.append((ma.mat_number, ws))
    ctx["mats_map"] = mats_map

    # ساخت داده‌ی براکت‌ها
    draws = (Draw.objects.filter(competition=comp, weight_category_id__in=weight_ids)
             .select_related("belt_group", "weight_category")
             .order_by("weight_category__min_weight", "id"))

    brackets = []
    for dr in draws:
        ms = (Match.objects.filter(draw=dr)
              .select_related("player_a", "player_b")
              .order_by("round_no", "slot_a", "id"))
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
                "match_number": m.match_number,
            })

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
            "matches_json": json.dumps(matches_json, ensure_ascii=False),
        })

    ctx["brackets"] = brackets
    ctx["board_logo_url"] = getattr(settings, "BOARD_LOGO_URL", None)
    return TemplateResponse(request, "admin/competitions/match_numbering.html", ctx)

@staff_member_required
@transaction.atomic
def numbering_publish_view(request):
    comp_id = (request.POST.get("competition") or "").strip()
    if not comp_id.isdigit():
        messages.error(request, "مسابقه انتخاب نشده است.")
        return redirect("/admin/competitions/numbering/")

    comp = KyorugiCompetition.objects.filter(pk=int(comp_id)).first()
    if not comp:
        messages.error(request, "مسابقه یافت نشد.")
        return redirect("/admin/competitions/numbering/")

    unpublish = request.GET.get("unpublish") in ("1", "true", "True")

    if unpublish:
        # لغو انتشار
        if getattr(comp, "bracket_published_at", None):
            comp.bracket_published_at = None
            comp.save(update_fields=["bracket_published_at"])
        messages.info(request, "جدول از پنل کاربر پنهان شد.")
    else:
        # قبل از انتشار، مطمئن شو همه‌ی بازی‌های واقعی شماره دارند
        has_unnumbered = (
            Match.objects
            .filter(draw__competition=comp, is_bye=False, match_number__isnull=True)
            .filter(player_a__isnull=False, player_b__isnull=False)  # فقط مسابقه‌های واقعی
            .exists()
        )
        if has_unnumbered:
            messages.error(request, "برخی مسابقات شماره‌گذاری نشده‌اند. ابتدا شماره‌گذاری را کامل کنید.")
            return redirect(f"/admin/competitions/numbering/?competition={comp.id}")

        if not getattr(comp, "bracket_published_at", None):
            comp.bracket_published_at = timezone.now()
            comp.save(update_fields=["bracket_published_at"])
        messages.success(request, "جدول منتشر شد و در پنل کاربر قابل مشاهده است.")

    return redirect(f"/admin/competitions/numbering/?competition={comp.id}")

# ثبت URLهای سفارشی (فقط یک‌بار و یک‌جا)
def _inject_numbering_url(get_urls_fn):
    def wrapper():
        urls = get_urls_fn()
        extra = [
            path(
                "competitions/numbering/",
                admin.site.admin_view(numbering_view),
                name="competitions_match_numbering",
            ),
            path(
                "competitions/numbering/publish/",
                admin.site.admin_view(numbering_publish_view),
                name="competitions_match_numbering_publish",
            ),
        ]
        return extra + urls
    return wrapper
admin.site.get_urls = _inject_numbering_url(admin.site.get_urls)

# === آیتم منوی ادمین برای صفحهٔ شماره‌گذاری (Proxy) ===
class NumberingEntry(KyorugiCompetition):
    class Meta:
        proxy = True
        verbose_name = "شماره‌گذاری بازی‌ها"
        verbose_name_plural = "شماره‌گذاری بازی‌ها"

@admin.register(NumberingEntry)
class NumberingEntryAdmin(admin.ModelAdmin):
    def has_add_permission(self, request): return False
    def has_change_permission(self, request, obj=None): return False
    def has_delete_permission(self, request, obj=None): return False

    # وقتی روی آیتم منو کلیک شد، مستقیم به ویوی سفارشی هدایت شود
    def changelist_view(self, request, extra_context=None):
        return HttpResponseRedirect(reverse("admin:competitions_match_numbering"))

# ============================ سمینار ============================

def _greg_to_jalali_str(val):
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

    def clean_registration_start(self): return _to_greg(self.cleaned_data.get("registration_start"))
    def clean_registration_end(self):   return _to_greg(self.cleaned_data.get("registration_end"))
    def clean_event_date(self):         return _to_greg(self.cleaned_data.get("event_date"))

    def save(self, commit=True):
        inst: Seminar = super().save(commit=False)
        inst.allowed_roles = self.cleaned_data.get("allowed_roles") or []
        if commit:
            inst.save()
        return inst

class SeminarAdmin(admin.ModelAdmin):
    """مدیریت سمینارها + نمای سفارشی لیست شرکت‌کنندگان"""
    form = SeminarAdminForm

    list_display = (
        "title",
        "registration_start_shamsi",
        "registration_end_shamsi",
        "event_date_shamsi",
        "fee",
        "allowed_roles_disp",
        "registrations_count_link",
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

    @admin.display(description="تاریخ برگزاری (شمسی)", ordering="event_date")
    def event_date_shamsi(self, obj: Seminar):
        return _greg_to_jalali_str(obj.event_date)

    @admin.display(description="شروع ثبت‌نام (شمسی)", ordering="registration_start")
    def registration_start_shamsi(self, obj: Seminar):
        return _greg_to_jalali_str(obj.registration_start)

    @admin.display(description="پایان ثبت‌نام (شمسی)", ordering="registration_end")
    def registration_end_shamsi(self, obj: Seminar):
        return _greg_to_jalali_str(obj.registration_end)

    def allowed_roles_disp(self, obj: Seminar):
        return obj.allowed_roles_display()
    allowed_roles_disp.short_description = "نقش‌های مجاز"

    @admin.display(description="تعداد ثبت‌نام")
    def registrations_count_link(self, obj: Seminar):
        url = reverse("admin:competitions_seminar_participants")
        url = f"{url}?seminar={obj.pk}"
        count = obj.registrations.count()
        return format_html('<a class="button" href="{}">{}</a>', url, count)

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
            mapping = dict(Seminar.ROLE_CHOICES)

            for i, r in enumerate(qs, 1):
                prof = getattr(r.user, "profile", None)
                full_name = (
                    ((getattr(prof, "first_name", "") + " " + getattr(prof, "last_name", "")).strip())
                    or (getattr(r.user, "get_full_name", lambda: "")() or str(r.user))
                )
                nid   = (getattr(prof, "national_code", "") or "").strip()
                belt  = (getattr(prof, "belt_grade", "") or "").strip()
                mobile = (r.phone or getattr(prof, "phone", "") or "").strip() or "—"
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

class SeminarAttendee(SeminarRegistration):
    class Meta:
        proxy = True
        verbose_name = "لیست شرکت‌کنندگان سمینارها"
        verbose_name_plural = "لیست شرکت‌کنندگان سمینارها"

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

@admin.register(SeminarAttendee)
class SeminarAttendeeAdmin(admin.ModelAdmin):
    change_list_template = "admin/competitions/seminar/participants_changelist.html"
    actions = [export_csv]

    def has_add_permission(self, request): return False
    def has_change_permission(self, request, obj=None): return False
    def has_delete_permission(self, request): return False

    def changelist_view(self, request, extra_context=None):
        seminars = Seminar.objects.all().order_by("-event_date", "-created_at")
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

# ============================ پومسه ============================

try:
    POOM_FIELDS = {f.name for f in PoomsaeCompetition._meta.get_fields()}
except Exception:
    POOM_FIELDS = set()

_HAS_AGE_CATEGORY   = "age_category"   in POOM_FIELDS
_HAS_AGE_CATEGORIES = "age_categories" in POOM_FIELDS

PoomsaeImageInline = None
PoomsaeFileInline  = None
try:
    from .models import PoomsaeImage
    class PoomsaeImageInline(admin.TabularInline):
        model = PoomsaeImage
        extra = 1
        verbose_name = "تصویر"
        verbose_name_plural = "تصاویر پیوست"
except Exception:
    pass

try:
    from .models import PoomsaeFile
    class PoomsaeFileInline(admin.TabularInline):
        model = PoomsaeFile
        extra = 1
        verbose_name = "فایل PDF"
        verbose_name_plural = "فایل‌های پیوست"
except Exception:
    pass

class PoomsaeCompetitionAdminForm(forms.ModelForm):
    if "draw_date" in POOM_FIELDS:
        draw_date = jforms.jDateField(label="تاریخ قرعه‌کشی", widget=jadmin.widgets.AdminjDateWidget, required=False)
    if "competition_date" in POOM_FIELDS:
        competition_date = jforms.jDateField(label="تاریخ برگزاری", widget=jadmin.widgets.AdminjDateWidget, required=False)
    if "registration_start" in POOM_FIELDS:
        registration_start = jforms.jDateField(label="شروع ثبت‌نام", widget=jadmin.widgets.AdminjDateWidget)
    if "registration_end" in POOM_FIELDS:
        registration_end   = jforms.jDateField(label="پایان ثبت‌نام", widget=jadmin.widgets.AdminjDateWidget)

    terms_template = forms.ModelChoiceField(
        queryset=TermsTemplate.objects.all(),
        required=False,
        label="قالب تعهدنامه",
        help_text="در صورت انتخاب، متن قالب به فیلد قوانین (terms_text) کپی می‌شود."
    )

    class Meta:
        model = PoomsaeCompetition
        exclude = tuple(x for x in ("start_date", "end_date") if x in POOM_FIELDS) + \
                  (("age_category",) if _HAS_AGE_CATEGORIES else ())

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        _init_jalali(self, [f for f in ("draw_date", "competition_date") if f in self.fields])

        if "age_categories" in self.fields:
            self.fields["age_categories"].label = "گروه‌های سنی"
        if "belt_level" in self.fields:
            self.fields["belt_level"].label = "رده کمربندی"
        if "belt_groups" in self.fields:
            self.fields["belt_groups"].label = "گروه‌های کمربندی"

        inst: PoomsaeCompetition | None = getattr(self, "instance", None)
        if inst and inst.pk:
            if "registration_start" in self.fields and inst.registration_start:
                dt = timezone.localtime(inst.registration_start) if timezone.is_aware(inst.registration_start) else inst.registration_start
                self.initial["registration_start"] = jdatetime.date.fromgregorian(date=dt.date())
            if "registration_end" in self.fields and inst.registration_end:
                dt = timezone.localtime(inst.registration_end) if timezone.is_aware(inst.registration_end) else inst.registration_end
                self.initial["registration_end"] = jdatetime.date.fromgregorian(date=dt.date())

        if "registration_manual" in self.fields:
            current = getattr(self.instance, "registration_manual", None)
            self.fields["registration_manual"] = TriStateChoiceField(label="فعال بودن ثبت‌نام")
            if not self.is_bound:
                self.initial["registration_manual"] = (
                    "" if current is None else ("1" if current is True else "0")
                )
            self.fields["registration_manual"].help_text = "خالی=طبق تاریخ‌ها، بله=اجباراً باز، خیر=اجباراً بسته"

    def clean_draw_date(self):        return _to_greg(self.cleaned_data.get("draw_date"))
    def clean_competition_date(self): return _to_greg(self.cleaned_data.get("competition_date"))

    def clean_registration_start(self):
        d = _to_greg(self.cleaned_data.get("registration_start"))
        if not d: return None
        dt = datetime.datetime.combine(d, datetime.time(0, 0, 0))
        return timezone.make_aware(dt, timezone.get_current_timezone())

    def clean_registration_end(self):
        d = _to_greg(self.cleaned_data.get("registration_end"))
        if not d: return None
        dt = datetime.datetime.combine(d, datetime.time(23, 59, 59))
        return timezone.make_aware(dt, timezone.get_current_timezone())

    def clean(self):
        cleaned = super().clean()
        rs = cleaned.get("registration_start")
        re = cleaned.get("registration_end")
        cd = cleaned.get("competition_date")

        if rs and re and rs > re:
            self.add_error("registration_start", "شروع ثبت‌نام نباید بعد از پایان ثبت‌نام باشد.")
        if cd and re and re.date() > cd:
            self.add_error("registration_end", "پایان ثبت‌نام باید قبل یا در همان روز برگزاری باشد.")
        return cleaned

    def save(self, commit=True):
        inst: PoomsaeCompetition = super().save(commit=False)

        re = self.cleaned_data.get("registration_end")
        cd = self.cleaned_data.get("competition_date")

        if cd:
            inst.start_date = cd
            inst.end_date   = cd
        elif re:
            d = timezone.localtime(re).date() if timezone.is_aware(re) else re.date()
            inst.start_date = d
            inst.end_date   = d

        tmpl = self.cleaned_data.get("terms_template")
        if tmpl:
            inst.terms_text = tmpl.content or ""

        if commit:
            inst.save()
            self.save_m2m()
        return inst

class PoomsaeCoachApprovalInline(admin.TabularInline):
    model = PoomsaeCoachApproval
    extra = 0
    fields = ("player", "coach", "code", "approved", "is_active", "created_at", "updated_at")
    readonly_fields = ("code", "created_at", "updated_at")
    autocomplete_fields = ("player", "coach")

@admin.register(PoomsaeCompetition)
class PoomsaeCompetitionAdmin(admin.ModelAdmin):
    form = PoomsaeCompetitionAdminForm

    _fh = []
    if "belt_groups" in POOM_FIELDS: _fh.append("belt_groups")
    if _HAS_AGE_CATEGORIES:          _fh.append("age_categories")
    if _fh: filter_horizontal = tuple(_fh)

    _inlines = []
    if PoomsaeImageInline: _inlines.append(PoomsaeImageInline)
    if PoomsaeFileInline:  _inlines.append(PoomsaeFileInline)
    _inlines.append(PoomsaeCoachApprovalInline)
    inlines = _inlines

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if "belt_groups" in POOM_FIELDS:
            qs = qs.prefetch_related("belt_groups")
        return qs

    list_display = (
        "name",
        "belt_groups_col",
        "gender",
        "competition_date_shamsi",
        "registration_open_col",
        "registration_manual",
        "entry_fee",
    )
    list_display_links = ("name",)

    search_fields = tuple(
        x for x in ("name", "public_id", "description", "city", "address")
        if (x in POOM_FIELDS) or x in ("name", "description")
    )
    list_filter = tuple(f for f in (
        ("registration_start", JDateFieldListFilter) if "registration_start" in POOM_FIELDS else None,
        ("registration_end",   JDateFieldListFilter) if "registration_end"   in POOM_FIELDS else None,
        ("draw_date",          JDateFieldListFilter) if "draw_date"          in POOM_FIELDS else None,
        ("competition_date",   JDateFieldListFilter) if "competition_date"   in POOM_FIELDS else None,
        "registration_manual",
        ("gender" if "gender" in POOM_FIELDS else None),
    ) if f)

    actions = []
    readonly_fields = tuple(f for f in ("public_id", "created_at", "updated_at") if f in POOM_FIELDS)
    ordering = ("-competition_date", "-id")

    def get_fieldsets(self, request, obj=None):
        form_instance = self.form()
        present = set(form_instance.fields.keys()) | set(self.readonly_fields)
        def keep(*names): return tuple(n for n in names if n and n in present)

        info = keep(
            "name", "poster", "description", "entry_fee",
            ("age_categories" if _HAS_AGE_CATEGORIES else ("age_category" if _HAS_AGE_CATEGORY else None)),
            "belt_level", "belt_groups", "gender",
        )
        place  = keep("city", "address")
        dates  = keep("registration_manual", "registration_start", "registration_end", "draw_date", "competition_date")
        terms  = keep("terms_template")
        system = keep("public_id", "created_at", "updated_at")

        fs = [("اطلاعات کلی", {"fields": info})]
        if place:  fs.append(("محل برگزاری", {"fields": place}))
        if dates:  fs.append(("ثبت‌نام و تاریخ‌ها (شمسی)", {"fields": dates}))
        if terms:  fs.append(("تعهدنامه مربی", {"fields": terms}))
        if system: fs.append(("سیستمی", {"fields": system, "classes": ("collapse",)}))
        return tuple(fs)

    @admin.display(description="گروه‌های کمربندی")
    def belt_groups_col(self, obj):
        if not hasattr(obj, "belt_groups"):
            return "—"
        labels = list(obj.belt_groups.values_list("label", flat=True))
        if not labels:
            return "—"
        shown = "، ".join(labels[:3])
        extra = len(labels) - 3
        return f"{shown} …(+{extra})" if extra > 0 else shown

    @admin.display(description="برگزاری (شمسی)", ordering="competition_date")
    def competition_date_shamsi(self, obj):
        return _to_jalali_str(getattr(obj, "competition_date", None))

    @admin.display(description="شروع ثبت‌نام (شمسی)")
    def registration_start_shamsi(self, obj):
        dt = getattr(obj, "registration_start", None)
        if dt and timezone.is_aware(dt): dt = timezone.localtime(dt)
        return _to_jalali_str(dt.date() if dt else None)

    @admin.display(description="پایان ثبت‌نام (شمسی)")
    def registration_end_shamsi(self, obj):
        dt = getattr(obj, "registration_end", None)
        if dt and timezone.is_aware(dt): dt = timezone.localtime(dt)
        return _to_jalali_str(dt.date() if dt else None)

    @admin.display(boolean=True, description="ثبت‌نام باز؟")
    def registration_open_col(self, obj):
        return obj.registration_open_effective

# اگر قبلاً ثبت بود و نمی‌خواهیم دیده شود
try:
    admin.site.unregister(PoomsaeEntry)
except admin.sites.NotRegistered:
    pass

# ======================= تأیید مربیان (یکپارچه) =======================

try:
    admin.site.unregister(CoachApproval)
except admin.sites.NotRegistered:
    pass
try:
    admin.site.unregister(PoomsaeCoachApproval)
except admin.sites.NotRegistered:
    pass

class CoachApprovalsEntry(KyorugiCompetition):
    class Meta():
        proxy = True
        verbose_name = "تأیید مربیان"
        verbose_name_plural = "تأیید مربیان"

@admin.register(CoachApprovalsEntry)
class CoachApprovalsAdmin(admin.ModelAdmin):
    change_list_template = "admin/competitions/approvals_unified.html"

    def has_add_permission(self, request): return False
    def has_change_permission(self, request, obj=None): return False
    def has_delete_permission(self, request, obj=None): return False

    def get_urls(self):
        urls = super().get_urls()
        custom = [
            path(
                "detail/<str:kind>/<int:comp_id>/",
                self.admin_site.admin_view(self.detail_view),
                name="competitions_approvals_detail",
            ),
        ]
        return custom + urls

    def changelist_view(self, request, extra_context=None):
        k_qs = (CoachApproval.objects
                .filter(terms_accepted=True, is_active=True)
                .select_related("competition")
                .order_by("-approved_at"))

        p_qs = (PoomsaeCoachApproval.objects
                .filter(approved=True, is_active=True)
                .select_related("competition")
                .order_by("-updated_at", "-created_at"))

        rows = []
        bundle = {}
        last_dt = {}

        for a in k_qs:
            key = ("ky", a.competition_id)
            b = bundle.setdefault(key, {
                "title": getattr(a.competition, "title", f"#{a.competition_id}"),
                "style": "کیوروگی", "count": 0
            })
            b["count"] += 1
            last_dt[key] = max(last_dt.get(key, a.approved_at), a.approved_at)

        for a in p_qs:
            key = ("pm", a.competition_id)
            b = bundle.setdefault(key, {
                "title": getattr(a.competition, "name", f"#{a.competition_id}"),
                "style": "پومسه", "count": 0
            })
            b["count"] += 1
            dt = a.updated_at or a.created_at
            last_dt[key] = max(last_dt.get(key, dt), dt)

        for (kind, cid), info in bundle.items():
            rows.append({
                "title": info["title"],
                "style": info["style"],
                "count": info["count"],
                "last": last_dt.get((kind, cid)),
                "detail_url": reverse("admin:competitions_approvals_detail", args=[kind, cid]),
            })

        rows.sort(key=lambda r: (r["last"] or datetime.datetime.min), reverse=True)
        for r in rows:
            r["last_j"] = _to_jalali_dt_str(r["last"])

        ctx = dict(self.admin_site.each_context(request))
        ctx.update({"title": "تأیید مربیان", "mode": "list", "rows": rows})
        if extra_context: ctx.update(extra_context)
        return TemplateResponse(request, "admin/competitions/approvals_unified.html", ctx)

    def detail_view(self, request, kind: str, comp_id: int):
        if request.method == "POST":
            del_id = request.POST.get("del_id")
            if del_id and del_id.isdigit():
                if kind == "ky":
                    CoachApproval.objects.filter(pk=int(del_id)).delete()
                else:
                    PoomsaeCoachApproval.objects.filter(pk=int(del_id)).delete()
                self.message_user(request, "حذف شد.", level=messages.SUCCESS)
                return redirect(request.path)

        rows = []
        if kind == "ky":
            comp = KyorugiCompetition.objects.filter(pk=comp_id).first()
            comp_title = getattr(comp, "title", f"#{comp_id}")
            qs = (CoachApproval.objects
                  .filter(competition_id=comp_id, terms_accepted=True, is_active=True)
                  .select_related("coach")
                  .order_by("-approved_at", "-id"))
            for a in qs:
                rows.append({
                    "id": a.id,
                    "coach": _full_name(a.coach) or "—",
                    "code": a.code or "—",
                    "date_j": _to_jalali_dt_str(a.approved_at),
                })
            style = "کیوروگی"
        else:
            comp = PoomsaeCompetition.objects.filter(pk=comp_id).first()
            comp_title = getattr(comp, "name", f"#{comp_id}")
            qs = (PoomsaeCoachApproval.objects
                  .filter(competition_id=comp_id, approved=True, is_active=True)
                  .select_related("coach")
                  .order_by("-updated_at", "-id"))
            for a in qs:
                rows.append({
                    "id": a.id,
                    "coach": _full_name(a.coach) or "—",
                    "code": a.code or "—",
                    "date_j": _to_jalali_dt_str(a.updated_at or a.created_at),
                })
            style = "پومسه"

        ctx = dict(self.admin_site.each_context(request))
        ctx.update({
            "title": f"تأیید مربیان – {comp_title}",
            "mode": "detail",
            "style": style,
            "comp_title": comp_title,
            "rows": rows,
            "back_url": reverse("admin:competitions_coachapprovalsentry_changelist"),
        })
        return TemplateResponse(request, "admin/competitions/approvals_unified.html", ctx)
