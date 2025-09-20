# tkdjango/reports/forms.py
from django import forms
import datetime as _dt

# --- پشتیبانی اختیاری از تاریخ جلالی برای فرم‌های بازه تاریخ (گزارش‌ها) ---
try:
    from django_jalali import forms as jforms
    import jdatetime
    _USE_JALALI = True
except Exception:
    jforms = jdatetime = None
    _USE_JALALI = False

if _USE_JALALI:
    JALALI_CSS = ("https://cdn.jsdelivr.net/npm/@majidh1/jalalidatepicker@0.6.0/dist/jalali-datepicker.min.css",)
    JALALI_JS  = ("https://cdn.jsdelivr.net/npm/@majidh1/jalalidatepicker@0.6.0/dist/jalali-datepicker.min.js",)
else:
    JALALI_CSS = JALALI_JS = ()

_FA = "۰۱۲۳۴۵۶۷۸۹"; _EN = "0123456789"
def _to_en(s):
    if not s: return ""
    return "".join(_EN[_FA.index(c)] if c in _FA else c for c in str(s))

def _norm_date(s):
    s = _to_en(s or "").strip()
    for sep in ("/",".","–","—","−"): s = s.replace(sep,"-")
    parts = [p for p in s.split("-") if p]
    return f"{parts[0]}-{parts[1].zfill(2)}-{parts[2].zfill(2)}" if len(parts)==3 else s

def _jstr_to_gdate(s):
    s = _norm_date(s)
    try:
        y,m,d = map(int, s.split("-"))
        return jdatetime.date(y,m,d).togregorian() if (_USE_JALALI and jdatetime) else None
    except:
        return None

_COMMON_ATTRS = {
    "class": "jalali-date-input", "data-jdp":"true", "data-jdp-only-date":"true",
    "placeholder":"YYYY/MM/DD", "autocomplete":"off", "inputmode":"none"
}

# -------------------------------
# فرم بازه تاریخ (برای سایر گزارش‌ها)
# -------------------------------
class DateRangeForm(forms.Form):
    if _USE_JALALI:
        start = jforms.jDateField(label="از تاریخ", required=False,
                                  widget=jforms.jDateInput(attrs=_COMMON_ATTRS))
        end   = jforms.jDateField(label="تا تاریخ", required=False,
                                  widget=jforms.jDateInput(attrs=_COMMON_ATTRS))
    else:
        start = forms.DateField(label="از تاریخ", required=False,
                                widget=forms.DateInput(attrs={"type":"date"}))
        end   = forms.DateField(label="تا تاریخ", required=False,
                                widget=forms.DateInput(attrs={"type":"date"}))

    class Media:
        css = {"all": JALALI_CSS}
        js  = JALALI_JS

    def clean(self):
        data = super().clean()
        s, e = data.get("start"), data.get("end")
        if _USE_JALALI:
            if isinstance(s,str): data["start"] = _jstr_to_gdate(s) or data.get("start")
            if isinstance(e,str): data["end"]   = _jstr_to_gdate(e) or data.get("end")
            for k in ("start","end"):
                v = data.get(k)
                if hasattr(v,"togregorian"): data[k] = v.togregorian()

        s, e = data.get("start"), data.get("end")
        if not s and not e:
            e = _dt.date.today(); s = e - _dt.timedelta(days=30)
        if s and e and s>e: s,e = e,s
        data["start"], data["end"] = s,e
        return data


# -------------------------------
# فرم شاگردان مربی (بدون جستجوی تاریخ تولد)
# -------------------------------
from .services import list_coaches_qs, get_club_qs, get_belt_choices

class CoachStudentsForm(forms.Form):
    coach = forms.ModelChoiceField(queryset=None, required=False, label="مربی")
    belt  = forms.ChoiceField(
        choices=[('', 'همهٔ کمربندها')] + get_belt_choices(),
        required=False, label="کمربند"
    )
    club  = forms.ModelChoiceField(queryset=None, required=False, label="باشگاه")
    national_code = forms.CharField(required=False, label="کدملی")

    # ⛔️ فیلدهای dob_start/dob_end حذف شدند (طبق خواسته)

    def __init__(self,*a,**kw):
        super().__init__(*a,**kw)
        # coach و club از queryset تغذیه می‌شوند
        self.fields["coach"].queryset = list_coaches_qs()
        cqs = get_club_qs()
        if cqs is not None:
            self.fields["club"].queryset = cqs
#-*-*-*-**-*-*-*-*-*-**-*--*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*
from .services import list_coaches_qs, get_club_qs, get_belt_choices

class ClubStudentsForm(forms.Form):
    club  = forms.ModelChoiceField(queryset=None, required=False, label="باشگاه")  # انتخاب اصلی
    belt  = forms.ChoiceField(
        choices=[('', 'همهٔ کمربندها')] + get_belt_choices(),
        required=False, label="کمربند"
    )
    coach = forms.ModelChoiceField(queryset=None, required=False, label="مربی")    # ← فیلتر جایگزین
    national_code = forms.CharField(required=False, label="کدملی")

    class Media:
        css = {"all": JALALI_CSS}
        js  = JALALI_JS

    def __init__(self,*a,**kw):
        super().__init__(*a,**kw)
        cqs = get_club_qs()
        if cqs is not None:
            self.fields["club"].queryset = cqs
        self.fields["coach"].queryset = list_coaches_qs()
