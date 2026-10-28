# CRP Mentor Copilot — Frontend

Frontend application for **CRP Mentor Copilot**, an AI-powered mentoring intelligence support platform designed for Cluster Resource Persons (CRPs).

The landing page features a cinematic watercolor aesthetic with warm paper texture, authentic botanical elements, responsive layout, fluid scroll entrances, interactive feature flashcards, and a human-in-the-loop decision interface.

---

## Tech Stack

- **Framework:** [React 19](https://react.dev/) + [Vite 8](https://vite.dev/)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **Styling:** [Tailwind CSS v4](https://tailwindcss.com/) with native CSS theme tokens
- **Icons:** [Lucide React](https://lucide.dev/)
- **Linter:** [Oxlint](https://oxc.rs/docs/guide/usage/linter.html)

---

## Prerequisites & Getting Started

Requires **Node.js 20.19+** (or **22.12+**) and **npm 10+**.

```bash
# 1. Install dependencies
npm install

# 2. Start local development server (with HMR)
npm run dev
# -> Opens at http://localhost:5173 (or next available port)

# 3. Type-check and produce production bundle
npm run build
# -> Builds optimized assets to dist/

# 4. Preview the production build locally
npm run preview

# 5. Run linter
npm run lint
```

---

## Project Structure

```
CRP MENTOR COPILOT LANDING PAGE/
├── public/
│   ├── images/
│   │   ├── crp-mentor-logo-icon.png      # Approved Growing Book logo (header & footer)
│   │   ├── crp-mentor-logo.png           # Master uncropped logo source
│   │   └── mentoring-checklist.png       # Human-in-the-Loop watercolor illustration
│   ├── favicon.svg                       # Vector favicon
│   ├── favicon-32x32.png                 # Standard PNG favicon
│   ├── favicon.png                       # High-res favicon fallback
│   └── apple-touch-icon.png              # Apple touch icon
├── src/
│   ├── components/
│   │   ├── cta/                          # Final call to action & closing landscape
│   │   │   ├── ClosingLandscape.tsx
│   │   │   └── FinalCta.tsx
│   │   ├── decor/                        # Organic watercolor edges, washes, clips, sprigs
│   │   │   ├── Clip.tsx
│   │   │   ├── FernSprig.tsx
│   │   │   ├── WashBackdrop.tsx
│   │   │   └── WatercolorEdge.tsx
│   │   ├── features/                     # Clothesline hanging feature flashcards
│   │   │   ├── FeatureFlashcards.tsx
│   │   │   ├── Flashcard.tsx
│   │   │   └── FlashcardPreviews.tsx
│   │   ├── hero/                         # Hero header, copy, watercolor landscape & leaves
│   │   │   ├── Hero.tsx
│   │   │   ├── HeroCopy.tsx
│   │   │   ├── HeroLandscape.tsx
│   │   │   └── HeroVisual.tsx
│   │   ├── impact/                       # Follow-up timeline & progress trajectory curve
│   │   │   ├── FollowUpImpact.tsx
│   │   │   └── ProgressCurve.tsx
│   │   ├── insights/                     # Shared color tones & priority badge styles
│   │   │   └── tones.ts
│   │   ├── judgment/                     # "Human in the Loop: The Copilot suggests. You decide."
│   │   │   ├── HumanInTheLoop.tsx
│   │   │   └── SharedMentoringMoment.tsx # Blended watercolor checklist & school scene
│   │   ├── layout/                       # Header, navigation, logo & footer
│   │   │   ├── Logo.tsx                  # Growing Book logo component
│   │   │   ├── navigation.ts             # Section links and dropdown navigation items
│   │   │   ├── SiteFooter.tsx            # Footer with "Made by Byte Busters."
│   │   │   └── SiteHeader.tsx            # Sticky header with responsive navigation
│   │   ├── motion/                       # Animation utilities and presets
│   │   │   ├── FallingLeaves.tsx         # GPU-accelerated falling leaf particles
│   │   │   ├── LeafShape.tsx             # Botanical leaf SVG paths
│   │   │   ├── leafPresets.ts            # Leaf placement and drift configurations
│   │   │   ├── ParallaxLayer.tsx         # CSS scroll-timeline parallax container
│   │   │   ├── Reveal.tsx                # Intersection-observer scroll reveal
│   │   │   └── timing.ts                 # Animation duration and stagger constants
│   │   ├── process/                      # "How it works" four-step mentoring path
│   │   │   └── HowItWorks.tsx
│   │   └── ui/                           # Reusable UI primitives
│   │       ├── Button.tsx                # Base button primitive for actions & forms
│   │       ├── ButtonLink.tsx            # Styled anchor button
│   │       ├── buttonStyles.ts           # Shared button variants (primary, secondary, ghost)
│   │       ├── Container.tsx             # Centered max-width page container
│   │       ├── Pill.tsx                  # Semantic status badges (High, Medium, Watch)
│   │       ├── SampleBadge.tsx           # "Illustrative sample" disclosure chip
│   │       └── SectionHeading.tsx        # Standardized section headings
│   ├── data/
│   │   └── sampleData.ts                 # Domain models, TypeScript interfaces & sample data
│   ├── hooks/
│   │   ├── useInViewAttribute.ts         # Viewport intersection detection
│   │   └── useSvgId.ts                   # Unique ID generation for SVG filters
│   ├── lib/
│   │   └── cn.ts                         # ClassName merging utility
│   ├── styles/
│   │   └── index.css                     # Tailwind v4 theme tokens, keyframes & utilities
│   ├── App.tsx                           # Page structure and section composition
│   └── main.tsx                          # React 19 entry point
├── index.html                            # Root HTML template with typography & metadata
├── package.json                          # Dependencies and scripts
├── package-lock.json                     # Deterministic dependency lockfile
├── tsconfig.json                         # Root TypeScript configuration
├── tsconfig.app.json                     # Application TypeScript settings with @/ path alias
├── tsconfig.node.json                    # Node configuration
├── vite.config.ts                        # Vite configuration with Tailwind CSS v4 & path aliases
└── .oxlintrc.json                        # Oxlint configuration
```

---

## Backend Integration Guide

This frontend was prepared for backend integration. Below are the key integration points:

### 1. Data Contracts & Domain Types (`src/data/sampleData.ts`)

The project contains fully-typed domain models that describe the entities expected from the backend:

- **School Priorities:**
  ```ts
  export type PriorityLevel = 'High' | 'Medium' | 'Watch'
  export interface SchoolPriority {
    school: string
    focus: string
    level: PriorityLevel
  }
  ```
- **Learning Gaps:**
  ```ts
  export type GapStatus = 'Needs focus' | 'Emerging' | 'On track'
  export interface LearningGap {
    area: string
    grade: string
    extent: number // 0 to 1
    status: GapStatus
  }
  ```
- **Mentoring Recommendations:**
  ```ts
  export interface MentoringRecommendation {
    school: string
    topic: string
    suggestion: string
  }
  ```
- **School Profiles & Evidence:**
  ```ts
  export type EvidenceSource = 'Classroom observation' | 'Assessment record' | 'Teacher conversation'
  export interface EvidenceItem {
    source: EvidenceSource
    note: string
  }
  export interface SchoolProfile {
    id: string
    name: string
    level: PriorityLevel
    focus: string
    lastVisit: string
    gaps: LearningGap[]
    evidence: EvidenceItem[]
    recommendation: string
  }
  ```
- **Follow-Up Stages:**
  ```ts
  export const followUpStages = ['Planned', 'Visited', 'Follow-up due', 'Reviewed'] as const
  export type FollowUpStage = (typeof followUpStages)[number]
  ```

### 2. Environment Variables

To connect your API server, create a `.env` file in the project root:

```bash
# Example .env
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

Access it anywhere in frontend code using `import.meta.env.VITE_API_BASE_URL`.

### 3. API Client Integration Recommendation

Create an API service layer in `src/api/` (e.g. `src/api/schools.ts`, `src/api/recommendations.ts`):

```ts
// src/api/client.ts
const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

export async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) throw new Error(`API error: ${res.statusText}`)
  return res.json()
}
```

### 4. Human-in-the-Loop Decision Flow (`src/components/judgment/`)

The core value proposition of CRP Mentor Copilot is **CRP decision authority**. When connecting the backend:
- Fetch Copilot recommendation payloads from your recommendation engine.
- Wire action buttons (Approve / Edit / Schedule Follow-up) to post decision payloads back to your API.
- Use `src/components/ui/Button.tsx` and `buttonStyles.ts` for consistent styling.

---

## Design System & Theme Tokens

All colors, typography, radii, elevations, and animations are centralized in the `@theme` block in `src/styles/index.css`:

| Category | Tokens | Values / Roles |
| :--- | :--- | :--- |
| **Brand** | `--color-brand-50` to `950` | Forest greens (`#1a3326` to `#eef5ef`) |
| **Accent** | `--color-accent-50` to `700` | Warm ochre / sunlight accents |
| **Clay** | `--color-clay-50` to `700` | Terracotta alert & warm review tones |
| **Teal / Sage** | `--color-teal-*`, `--color-sage-*` | Muted organic greens and foliage |
| **Surfaces** | `--color-background`, `--color-surface` | Warm ivory paper (`#f8f2e5`, `#fffcf5`) |
| **Headings** | `--font-display` | `Fraunces` editorial serif with optical sizing |
| **Body** | `--font-sans` | `Inter` modern sans-serif |
| **Textures** | `@utility paper-texture`, `paper-grain` | Fine SVG fiber grain + soft watercolor washes |

All animations respect `prefers-reduced-motion: reduce`.
