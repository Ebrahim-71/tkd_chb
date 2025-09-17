# competitions/urls.py
from django.urls import path, register_converter
from .views import (
    KyorugiCompetitionDetailView,RegisterSelfView,RegisterSelfPrefillView,
    CoachApprovalStatusView,ApproveCompetitionView,PlayerCompetitionsList,
    RefereeCompetitionsList,DashboardKyorugiListView,EnrollmentCardView,
    MyEnrollmentView,KyorugiBracketView,EnrollmentCardsBulkView,
    CoachStudentsEligibleListView,CoachRegisterStudentsView,KyorugiResultsView,
    SeminarListView,SeminarDetailView,SeminarRegisterView,sidebar_seminars,#SeminarPayCallbackView

)

app_name = "competitions"

class PublicKeyConverter:
    regex = r"[a-z0-9]{10,16}"   # با چک داخل ویو هماهنگ
    def to_python(self, value): return value
    def to_url(self, value): return value

register_converter(PublicKeyConverter, "pkey")

urlpatterns = [
    # ==== عمومی ====
    path("kyorugi/<pkey:key>/", KyorugiCompetitionDetailView.as_view(), name="detail"),
    path("kyorugi/<pkey:key>/bracket/", KyorugiBracketView.as_view(), name="kyorugi-bracket"),
    path("kyorugi/<pkey:key>/results/", KyorugiResultsView.as_view(), name="kyorugi-results"),              # ← اضافه شد (مسیر استاندارد)
    path("competitions/<pkey:key>/results/", KyorugiResultsView.as_view(), name="kyorugi-results-compat"),  # ← سازگاری با فرانت قدیمی

    # ==== احراز هویت ====
    path("auth/kyorugi/<pkey:key>/prefill/", RegisterSelfPrefillView.as_view(), name="prefill"),
    path("auth/kyorugi/<pkey:key>/register/self/", RegisterSelfView.as_view(), name="register-self"),
    path("auth/kyorugi/<pkey:key>/coach-approval/status/", CoachApprovalStatusView.as_view(), name="coach-approval-status"),
    path("auth/kyorugi/<pkey:key>/coach-approval/approve/", ApproveCompetitionView.as_view(), name="coach-approval-approve"),
    path("auth/kyorugi/<pkey:key>/my-enrollment/", MyEnrollmentView.as_view(), name="my-enrollment"),
    path("auth/enrollments/<int:enrollment_id>/card/", EnrollmentCardView.as_view(), name="enrollment-card"),
    path("auth/dashboard/kyorugi/", DashboardKyorugiListView.as_view(), name="dashboard-list"),
    path("kyorugi/player/competitions/",  PlayerCompetitionsList.as_view(),  name="player-competitions"),
    path("kyorugi/referee/competitions/", RefereeCompetitionsList.as_view(), name="referee-competitions"),

    # مربی
    path("auth/kyorugi/<pkey:key>/coach/students/eligible/", CoachStudentsEligibleListView.as_view(), name="coach-eligible-students"),
    path("auth/kyorugi/<pkey:key>/coach/register/students/", CoachRegisterStudentsView.as_view(), name="coach-register-students"),
    path("auth/kyorugi/<pkey:key>/register/students/", CoachRegisterStudentsView.as_view(), name="register-students-bulk-alias"),

    # کارت‌های گروهی
    path("auth/enrollments/cards/bulk/", EnrollmentCardsBulkView.as_view(), name="enrollment-cards-bulk"),

    # public
    path("seminars/", SeminarListView.as_view(), name="seminar-list"),
    path("seminars/<pkey:key>/", SeminarDetailView.as_view(), name="seminar-detail"),

    # auth (ثبت‌نام)
    path("auth/seminars/<pkey:key>/register/", SeminarRegisterView.as_view(), name="seminar-register"),

    # path("auth/seminars/<pkey:key>/pay/callback/", SeminarPayCallbackView.as_view(), name="seminar-pay-callback"),

    path("seminars/sidebar/", sidebar_seminars, name="seminars-sidebar"),


]
