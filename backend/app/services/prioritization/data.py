"""Loads everything the engine needs from PostgreSQL into plain dicts."""
import datetime as dt
import os
import psycopg
from psycopg.rows import dict_row


def get_conn():
    return psycopg.connect(os.environ['DATABASE_URL'], row_factory=dict_row)


class Data:
    def __init__(self, conn):
        q = lambda sql: conn.execute(sql).fetchall()
        self.schools = q('select * from schools where is_active order by code')
        self.teachers = q('select * from teachers where is_active order by teacher_code')
        self.assessments = q('select * from assessments')
        self.observations = q('select * from observations')
        self.visits = q('select * from visits')
        self.follow_ups = q("""select f.*, i.approved_action as action, i.responsible, i.observation_id, i.source_file_id as plan_file_id, i.locator as plan_locator
                               from follow_ups f left join interventions i on i.id = f.intervention_id""")
        self.interventions = q('select * from interventions')
        self.files = {f['id']: f for f in q('select * from source_files')}
        self.categories = {c['code']: c for c in q('select * from priority_categories')}
        cfg = conn.execute("select * from priority_configurations where status = 'active'").fetchone()
        self.config = cfg
        self.weights = {r['code']: float(r['weight']) for r in conn.execute(
            'select c.code, w.weight from priority_config_weights w join priority_categories c on c.id = w.category_id where w.config_id = %s', (cfg['id'],)).fetchall()}
        self.school_by_id = {s['id']: s for s in self.schools}
        self.teacher_by_id = {t['id']: t for t in self.teachers}
        self.teachers_by_school = {}
        for t in self.teachers:
            self.teachers_by_school.setdefault(t['school_id'], []).append(t)
        self.attendance_by_school = {}
        for a in q('select * from attendance order by month'):
            a['month_date'] = dt.date.fromisoformat(a['month'] + '-01')
            self.attendance_by_school.setdefault(a['school_id'], []).append(a)
        # Latest valid value per (school, key) and (teacher, key).
        self.school_facts, self.teacher_facts, self.fact_by_id = {}, {}, {}
        for f in q("select * from facts where validation_status <> 'invalid' order by as_of_date, created_at"):
            self.fact_by_id[f['id']] = f
            if f['teacher_id']: self.teacher_facts.setdefault(f['teacher_id'], {})[f['fact_key']] = f
            else: self.school_facts.setdefault(f['school_id'], {})[f['fact_key']] = f
        today = dt.date.today()
        self.overrides = {}
        for o in q('select * from priority_overrides where active order by created_at'):
            if o['expires_on'] and o['expires_on'] < today: continue
            self.overrides[(o['entity_type'], str(o['teacher_id'] if o['entity_type'] == 'teacher' else o['school_id']))] = o
