export interface DropdownItem {
  title: string
  description?: string
  href: string
}

export interface NavSection {
  label: string
  href: string
  items: DropdownItem[]
}

/** In-page sections for footer and main navigation (Demo removed). */
export const sectionLinks = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Your judgment', href: '#your-judgment' },
  { label: 'Follow-up', href: '#follow-up' },
]

export const headerNavItems: NavSection[] = [
  {
    label: 'Features',
    href: '#features',
    items: [
      { title: 'School Priorities', description: 'Identify schools needing attention.', href: '#features' },
      { title: 'Learning Gaps', description: 'Understand learning needs.', href: '#features' },
      { title: 'Visit Guidance', description: 'Plan focused mentoring visits.', href: '#features' },
      { title: 'Follow-up Tracking', description: 'Monitor actions and progress.', href: '#features' },
    ],
  },
  {
    label: 'How It Works',
    href: '#how-it-works',
    items: [
      { title: 'Gather Evidence', href: '#how-it-works' },
      { title: 'Identify Priorities', href: '#how-it-works' },
      { title: 'Plan Mentoring', href: '#how-it-works' },
      { title: 'Review Progress', href: '#how-it-works' },
    ],
  },
  {
    label: 'Your Judgment',
    href: '#your-judgment',
    items: [
      { title: 'AI suggests; the CRP decides.', href: '#your-judgment' },
      { title: 'Review recommendations.', href: '#your-judgment' },
      { title: 'Choose the next action.', href: '#your-judgment' },
    ],
  },
  {
    label: 'Follow-up',
    href: '#follow-up',
    items: [
      { title: 'Track mentoring actions.', href: '#follow-up' },
      { title: 'Monitor progress.', href: '#follow-up' },
      { title: 'Identify pending follow-ups.', href: '#follow-up' },
    ],
  },
]

