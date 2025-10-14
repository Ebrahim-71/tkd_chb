from django.db import migrations

class Migration(migrations.Migration):
    dependencies = [
        ('competitions', '0032_poomsaecompetition_terms_template_poomsaedivision_and_more'),
    ]

    operations = [
        # اگر AlterField روی Match.winner داری، همونو بگذار

        migrations.DeleteModel(name='PoomsaeEntry'),
        migrations.DeleteModel(name='PoomsaeDivision'),
        migrations.DeleteModel(name='PoomsaeImage'),
        migrations.DeleteModel(name='PoomsaeFile'),
        migrations.DeleteModel(name='PoomsaeCoachApproval'),
        migrations.DeleteModel(name='PoomsaeCompetition'),
    ]
