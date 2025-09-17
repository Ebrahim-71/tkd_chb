from rest_framework.permissions import BasePermission
from accounts.models import UserProfile

class IsCoach(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and UserProfile.objects.filter(user=request.user, is_coach=True).exists()

class IsPlayer(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and UserProfile.objects.filter(user=request.user, role='player').exists()
