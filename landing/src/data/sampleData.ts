/*
 * Illustrative sample content used across the landing page.
 * None of this describes real schools, people, measurements or outcomes.
 * Every surface that shows it is labelled as sample or illustrative.
 */

export type PriorityLevel = 'High' | 'Medium' | 'Watch'

export interface SchoolPriority {
  school: string
  focus: string
  level: PriorityLevel
}

export const schoolPriorities: SchoolPriority[] = [
  { school: 'Sample School A', focus: 'Foundational numeracy', level: 'High' },
  { school: 'Sample School B', focus: 'Early reading', level: 'Medium' },
  { school: 'Sample School C', focus: 'Classroom routines', level: 'Watch' },
]

export type GapStatus = 'Needs focus' | 'Emerging' | 'On track'

export interface LearningGap {
  area: string
  grade: string
  /** Relative bar length between 0 and 1. */
  extent: number
  status: GapStatus
}

export const learningGaps: LearningGap[] = [
  { area: 'Reading fluency', grade: 'Grade 3', extent: 0.68, status: 'Needs focus' },
  { area: 'Place value', grade: 'Grade 4', extent: 0.5, status: 'Emerging' },
  { area: 'Written expression', grade: 'Grade 5', extent: 0.3, status: 'On track' },
]

export const mentoringRecommendation = {
  school: 'Sample School A',
  topic: 'Grade 4 · Numeracy',
  suggestion:
    'Co-plan a short place-value warm-up with the Grade 4 teacher, then observe one lesson that uses it.',
}

/* Feature flashcards */

export interface GradeIndicator {
  grade: string
  /** Relative bar heights between 0 and 1. */
  reading: number
  numeracy: number
}

export const gradeIndicators: GradeIndicator[] = [
  { grade: 'Gr 3', reading: 0.42, numeracy: 0.58 },
  { grade: 'Gr 4', reading: 0.55, numeracy: 0.4 },
  { grade: 'Gr 5', reading: 0.7, numeracy: 0.62 },
]

export const visitPlan = {
  school: 'Sample School B',
  focus: 'Early reading routines',
  visitDay: 'Tue',
  visitWeek: 'Week 2',
  followUp: 'Week 4',
  checklist: ['Observe a reading lesson', 'Model paired reading'],
}

export interface ProgressPair {
  area: string
  /** Relative bar lengths between 0 and 1. */
  baseline: number
  followUp: number
}

export const progressPairs: ProgressPair[] = [
  { area: 'Reading fluency', baseline: 0.34, followUp: 0.58 },
  { area: 'Place value', baseline: 0.28, followUp: 0.47 },
]

/* Dashboard showcase */

export type EvidenceSource = 'Classroom observation' | 'Assessment record' | 'Teacher conversation'

export interface EvidenceItem {
  source: EvidenceSource
  note: string
}

export const followUpStages = ['Planned', 'Visited', 'Follow-up due', 'Reviewed'] as const
export type FollowUpStage = (typeof followUpStages)[number]

export interface SchoolProfile {
  id: string
  name: string
  level: PriorityLevel
  focus: string
  lastVisit: string
  gaps: LearningGap[]
  evidence: EvidenceItem[]
  recommendation: string
  followUp: { stage: FollowUpStage; note: string }
}

export const schoolProfiles: SchoolProfile[] = [
  {
    id: 'a',
    name: 'Sample School A',
    level: 'High',
    focus: 'Foundational numeracy',
    lastVisit: '3 weeks ago',
    gaps: [
      { area: 'Place value', grade: 'Grade 4', extent: 0.72, status: 'Needs focus' },
      { area: 'Number operations', grade: 'Grade 3', extent: 0.55, status: 'Emerging' },
      { area: 'Reading fluency', grade: 'Grade 3', extent: 0.32, status: 'On track' },
    ],
    evidence: [
      { source: 'Assessment record', note: 'Many Grade 4 learners mix up tens and ones in two-digit numbers.' },
      { source: 'Classroom observation', note: 'Lessons rely on board work; few hands-on materials in use.' },
      { source: 'Teacher conversation', note: 'Teacher asked for ideas to make place value more concrete.' },
    ],
    recommendation:
      'Co-plan a short place-value warm-up using bundled sticks, then observe one lesson that uses it.',
    followUp: { stage: 'Follow-up due', note: 'Follow-up visit suggested within two weeks.' },
  },
  {
    id: 'b',
    name: 'Sample School B',
    level: 'Medium',
    focus: 'Early reading',
    lastVisit: '10 days ago',
    gaps: [
      { area: 'Reading fluency', grade: 'Grade 3', extent: 0.6, status: 'Emerging' },
      { area: 'Letter–sound knowledge', grade: 'Grade 2', extent: 0.48, status: 'Emerging' },
      { area: 'Comprehension', grade: 'Grade 3', extent: 0.36, status: 'On track' },
    ],
    evidence: [
      { source: 'Classroom observation', note: 'Learners read aloud in chorus; little individual practice.' },
      { source: 'Assessment record', note: 'Oral reading checks show slow, word-by-word reading.' },
      { source: 'Teacher conversation', note: 'Teacher is keen to try a daily reading routine.' },
    ],
    recommendation: 'Introduce a daily ten-minute paired-reading routine and model it with one class.',
    followUp: { stage: 'Visited', note: 'Routine introduced; next check-in planned.' },
  },
  {
    id: 'c',
    name: 'Sample School C',
    level: 'Watch',
    focus: 'Classroom routines',
    lastVisit: '5 weeks ago',
    gaps: [
      { area: 'Written expression', grade: 'Grade 5', extent: 0.4, status: 'Emerging' },
      { area: 'Reading fluency', grade: 'Grade 4', extent: 0.3, status: 'On track' },
      { area: 'Place value', grade: 'Grade 5', extent: 0.26, status: 'On track' },
    ],
    evidence: [
      { source: 'Classroom observation', note: 'Group work starts slowly; transitions take much of the period.' },
      { source: 'Teacher conversation', note: 'Teachers would like simple routines for group activities.' },
    ],
    recommendation: 'Share two quick transition routines and review them together at the next visit.',
    followUp: { stage: 'Planned', note: 'First visit of the term is planned.' },
  },
  {
    id: 'd',
    name: 'Sample School D',
    level: 'Medium',
    focus: 'Learning materials',
    lastVisit: '2 weeks ago',
    gaps: [
      { area: 'Number operations', grade: 'Grade 2', extent: 0.52, status: 'Emerging' },
      { area: 'Reading fluency', grade: 'Grade 2', extent: 0.44, status: 'Emerging' },
      { area: 'Comprehension', grade: 'Grade 4', extent: 0.28, status: 'On track' },
    ],
    evidence: [
      { source: 'Classroom observation', note: 'Teaching-learning materials are stored away and rarely used.' },
      { source: 'Assessment record', note: 'Grade 2 learners struggle with addition beyond ten.' },
    ],
    recommendation: 'Help the teacher set up a number corner and plan one lesson that uses it.',
    followUp: { stage: 'Reviewed', note: 'Progress reviewed; new focus agreed with the teacher.' },
  },
]

/* Human-in-the-loop demo */

export const reviewRecommendation = {
  school: 'Sample School C',
  context: 'Grade 4 · Place value',
  suggestion:
    'Model one place-value lesson using bundled sticks, then observe the teacher lead the next one.',
  evidence: [
    'Assessment record: learners often swap tens and ones.',
    'Classroom observation: no hands-on materials in recent lessons.',
    'Teacher conversation: teacher asked for concrete activities.',
  ],
}

/* Follow-up timeline */

export interface TimelineEntry {
  when: string
  title: string
  note: string
  /** Illustrative level on the progress curve, 0 (beginning) to 1 (secure). */
  level: number
}

export const mentoringTimeline: TimelineEntry[] = [
  {
    when: 'Week 1',
    title: 'Initial observation',
    note: 'Grade 3 learners read word by word; the teacher wants more reading time.',
    level: 0.08,
  },
  {
    when: 'Week 1',
    title: 'Agreed mentoring action',
    note: 'Teacher and CRP agree on a daily ten-minute paired-reading routine.',
    level: 0.3,
  },
  {
    when: 'Week 3',
    title: 'Follow-up visit',
    note: 'The routine is in place; the CRP models questions to ask during reading.',
    level: 0.55,
  },
  {
    when: 'Week 6',
    title: 'Progress review',
    note: 'Teacher and CRP review notes together and choose the next focus.',
    level: 0.78,
  },
]
