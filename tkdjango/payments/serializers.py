from rest_framework import serializers

class InitiateSerializer(serializers.Serializer):
    competition_id = serializers.CharField()  # public_id یا pk
    style = serializers.ChoiceField(choices=[("kyorugi", "kyorugi")], default="kyorugi")
    # در صورت نیاز فیلدهای اضافی بفرست
