# competitions/urls.py
from django.urls import path, include, register_converter
from rest_framework.routers import DefaultRouter

from .views import (
    # Kyorugi
    KyorugiCompetitionDetailView, KyorugiBracketView, KyorugiResultsView,
    CompetitionTermsView, CompetitionDetailAnyView,

    # Kyorugi auth
    RegisterSelfPrefillView, RegisterSelfView,
    CoachApprovalStatusView, ApproveCompetitionView,
    MyEnrollmentView, EnrollmentCardView, EnrollmentCardsBulkView,
    DashboardKyorugiListView, PlayerCompetitionsList, RefereeCompetitionsList,
    CoachStudentsEligibleListView, CoachRegisterStudentsView,

    # Seminars
    SeminarListView, SeminarDetailView, SeminarRegisterView, sidebar_seminars,

    # Poomsae
    DashboardPoomsaeListView, DashboardAllCompetitionsView,
    PoomsaeCoachApprovalStatusAPI, PoomsaeCoachApproveAPI,
    PoomsaeMyEnrollmentView, PoomsaeSelfPrefillView, PoomsaeRegisterSelfView,
    PoomsaeEnrollmentsGroupedView, PoomsaeCompetitionViewSet,
)

app_name = "competitions"

# --- converter: numeric id یا public_id (8..36 حروف/عدد/خط‌تیره)
class CompKeyConverter:
    regex = r"(?:\d+|[A-Za-z0-9\-]{8,36})"
    def to_python(self, value): return value
    def to_url(self, value): return str(value)

register_converter(CompKeyConverter, "ckey")

# --- Router برای ViewSet پومسه ---
router = DefaultRouter()
router.register(r"poomsae", PoomsaeCompetitionViewSet, basename="poomsae-competitions")

urlpatterns = [
    # ========================= عمومی Kyorugi =========================
    path("kyorugi/<ckey:key>/",             KyorugiCompetitionDetailView.as_view(), name="kyorugi-detail"),
    path("kyorugi/<ckey:key>/terms/",       CompetitionTermsView.as_view(),         name="kyorugi-terms"),
    path("kyorugi/<ckey:key>/bracket/",     KyorugiBracketView.as_view(),          name="kyorugi-bracket"),
    path("kyorugi/<ckey:key>/results/",     KyorugiResultsView.as_view(),          name="kyorugi-results"),
    # سازگاری قدیمی نتایج
    path("competitions/<ckey:key>/results/", KyorugiResultsView.as_view(),          name="kyorugi-results-compat"),

    # ========================= احراز هویت Kyorugi =========================
    path("auth/kyorugi/<ckey:key>/prefill/",               RegisterSelfPrefillView.as_view(),      name="prefill"),
    path("auth/kyorugi/<ckey:key>/register/self/",         RegisterSelfView.as_view(),             name="register-self"),
    path("auth/kyorugi/<ckey:key>/coach-approval/status/", CoachApprovalStatusView.as_view(),      name="coach-approval-status"),
    path("auth/kyorugi/<ckey:key>/coach-approval/approve/",ApproveCompetitionView.as_view(),       name="coach-approval-approve"),
    path("auth/kyorugi/<ckey:key>/my-enrollment/",         MyEnrollmentView.as_view(),             name="my-enrollment"),
    path("auth/enrollments/<int:enrollment_id>/card/",     EnrollmentCardView.as_view(),           name="enrollment-card"),
    path("auth/enrollments/cards/bulk/",                   EnrollmentCardsBulkView.as_view(),      name="enrollment-cards-bulk"),
    path("auth/kyorugi/<ckey:key>/coach/students/eligible/", CoachStudentsEligibleListView.as_view(), name="coach-eligible-students"),
    path("auth/kyorugi/<ckey:key>/coach/register/students/",  CoachRegisterStudentsView.as_view(),    name="coach-register-students"),
    path("auth/kyorugi/<ckey:key>/register/students/",        CoachRegisterStudentsView.as_view(),    name="register-students-bulk-alias"),
    path("auth/dashboard/kyorugi/",                        DashboardKyorugiListView.as_view(),     name="dashboard-kyorugi"),
    path("kyorugi/player/competitions/",                   PlayerCompetitionsList.as_view(),        name="player-competitions"),
    path("kyorugi/referee/competitions/",                  RefereeCompetitionsList.as_view(),       name="referee-competitions"),

    # ========================= پومسه =========================
    # کد مربی
    path("auth/poomsae/<str:public_id>/coach-approval/status/",  PoomsaeCoachApprovalStatusAPI.as_view(), name="poomsae-coach-approval-status"),
    path("auth/poomsae/<str:public_id>/coach-approval/approve/", PoomsaeCoachApproveAPI.as_view(),        name="poomsae-coach-approve"),
    # ثبت‌نام/پریفیل خودی
    path("auth/poomsae/<str:public_id>/prefill/",         PoomsaeSelfPrefillView.as_view(),        name="poomsae-self-prefill"),
    path("auth/poomsae/<str:public_id>/register/self/",   PoomsaeRegisterSelfView.as_view(),       name="poomsae-register-self"),
    # ثبت‌نام من (برای کارت)
    path("auth/poomsae/<str:public_id>/my-enrollment/",   PoomsaeMyEnrollmentView.as_view(),       name="poomsae-my-enrollment"),
    # داشبوردها
    path("auth/dashboard/poomsae/",                       DashboardPoomsaeListView.as_view(),      name="dashboard-poomsae"),
    path("auth/dashboard/all/",                           DashboardAllCompetitionsView.as_view(),  name="dashboard-all"),
    # compat برای فرانت‌های قدیمی
    path("competitions/auth/poomsae/<str:public_id>/prefill/",         PoomsaeSelfPrefillView.as_view(),  name="poomsae-self-prefill-compat"),
    path("competitions/auth/poomsae/<str:public_id>/register/self/",   PoomsaeRegisterSelfView.as_view(), name="poomsae-register-self-compat"),
    path("competitions/auth/poomsae/<str:public_id>/coach-approval/status/",  PoomsaeCoachApprovalStatusAPI.as_view(), name="poomsae-coach-approval-status-compat"),
    path("competitions/auth/poomsae/<str:public_id>/coach-approval/approve/", PoomsaeCoachApproveAPI.as_view(),        name="poomsae-coach-approve-compat"),
    # گروه‌بندی ثبت‌نام‌ها
    path("poomsae/<str:public_id>/enrollments/grouped/",  PoomsaeEnrollmentsGroupedView.as_view(), name="poomsae-enrollments-grouped"),

    # ========================= سمینار =========================
    path("seminars/",                       SeminarListView.as_view(),   name="seminar-list"),
    path("seminars/<ckey:key>/",            SeminarDetailView.as_view(), name="seminar-detail"),
    path("auth/seminars/<ckey:key>/register/", SeminarRegisterView.as_view(), name="seminar-register"),
    path("seminars/sidebar/",               sidebar_seminars,            name="seminars-sidebar"),

    # ========================= ترم‌ها (عمومی) =========================
    path("<ckey:key>/terms/",                        CompetitionTermsView.as_view(),    name="terms-generic"),
    path("competitions/kyorugi/<ckey:key>/terms/",   CompetitionTermsView.as_view(),    name="kyorugi-terms-compat"),

    # ========================= جزئیات مسابقه (GENERIC) =========================
    path("<ckey:key>/",                   CompetitionDetailAnyView.as_view(), name="competition-detail-any"),
    path("competitions/<ckey:key>/",      CompetitionDetailAnyView.as_view(), name="competition-detail-any-compat"),

    # --- Router urls (ViewSet ها) ---
    path("", include(router.urls)),
]
