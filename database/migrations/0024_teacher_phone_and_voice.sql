-- A teacher's phone number (for sending the report and the voice message on WhatsApp) and the spoken review of a visit.
--   teachers.phone        : digits with country code, for example 919876543210 (the app accepts 10-digit Indian numbers and adds 91)
--   visit_sessions.voice  : {language, voice_language, gender, script, key (the saved mp3), seconds, by, made_at} of the newest voice message
alter table teachers add column if not exists phone text;
alter table visit_sessions add column if not exists voice jsonb;
