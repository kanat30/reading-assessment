# Implementation Plan: Passage Library & Reading Level Selection

> **Status:** Planning
> **Created:** 2024-06-23
> **Scope:** Integrate new passage library, reading level selection, flexible passage count, and benchmark scoring

---

## 1. Executive Summary

### What We're Building

Transform FluencyScope from a single-passage demo tool into a production-ready ORF assessment system with:

1. **Leveled passage library** — 15 passages across 5 reading levels (already built)
2. **Reading level selection** — Teachers pick student reading level, not grade
3. **Flexible passage count** — 1, 2, or 3 passages per assessment
4. **Median-of-3 scoring** — When 3 passages used, report median WCPM
5. **Benchmark bands** — At/Below/Well Below using Hasbrouck-Tindal norms
6. **Smart period detection** — Auto-detect BOY/MOY/EOY from date, allow override

### Why This Matters

The core use case is **6th graders reading at 4th-grade level**. Current system doesn't support below-grade routing or standardized benchmark reporting that MTSS teams need.

---

## 2. Current State

### What Exists

| Component | Status |
|-----------|--------|
| `lib/passages/library.ts` | ✅ Built — 15 passages, 5 levels, utilities |
| `lib/passages.ts` (old) | ❌ Remove — 4 demo passages |
| Assessment creation UI | ⚠️ Needs update — no level selection |
| Student reading flow | ⚠️ Needs update — single passage only |
| Report/scoring | ⚠️ Needs update — no benchmark bands |
| Database schema | ⚠️ Needs migration — new columns |

### Files to Modify

```
app/
├── dashboard/client.tsx          # Assessment creation flow
├── read/[token]/page.tsx         # Student reading flow
├── read/[token]/record/page.tsx  # Recording page
├── read/[token]/done/page.tsx    # Completion page
├── report/[id]/page.tsx          # Teacher report
├── api/
│   ├── assessments/route.ts      # Create assessment endpoint
│   └── score/route.ts            # Scoring endpoint
lib/
├── passages.ts                   # DELETE (old demo passages)
├── passages/library.ts           # Already built ✅
└── scoring/                      # Add benchmark logic
supabase/
└── migrations/                   # New migration for schema changes
```

---

## 3. Database Schema Changes

### New Migration: `0016_passage_library_schema.sql`

```sql
-- Add columns to assessments table
ALTER TABLE assessments
ADD COLUMN reading_level INTEGER CHECK (reading_level BETWEEN 3 AND 7),
ADD COLUMN passage_ids TEXT[] NOT NULL DEFAULT '{}',
ADD COLUMN assessment_period TEXT CHECK (assessment_period IN ('BOY', 'MOY', 'EOY'));

-- Add columns to sessions table
ALTER TABLE sessions
ADD COLUMN passage_index INTEGER DEFAULT 0,
ADD COLUMN passage_id TEXT;

-- Create view for median scoring (when multiple passages)
CREATE OR REPLACE FUNCTION calculate_median_wcpm(assessment_id UUID)
RETURNS NUMERIC AS $$
  SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY wcpm)
  FROM sessions
  WHERE sessions.assessment_id = $1
    AND wcpm IS NOT NULL;
$$ LANGUAGE SQL;

-- Index for efficient queries
CREATE INDEX idx_sessions_assessment_passage ON sessions(assessment_id, passage_index);
```

### Updated Types

```typescript
// types/database.ts (or wherever types live)
interface Assessment {
  id: string;
  title: string;
  // NEW FIELDS
  reading_level: 3 | 4 | 5 | 6 | 7;
  passage_ids: string[];           // Array of passage IDs
  assessment_period: 'BOY' | 'MOY' | 'EOY';
  // ... existing fields
}

interface Session {
  id: string;
  assessment_id: string;
  // NEW FIELDS
  passage_index: number;           // 0, 1, or 2
  passage_id: string;              // Which passage this session is for
  // ... existing fields
}
```

---

## 4. Assessment Creation Flow

### Current Flow
```
Title → Select Passage → Add Questions → Create
```

### New Flow
```
Title → Select Reading Level → Select Passage Count → Select Passages → Questions → Create
```

### UI Components to Build

#### Step 1: Reading Level Selection

```typescript
// components/assessment/ReadingLevelSelector.tsx
interface ReadingLevelSelectorProps {
  value: ReadingLevel;
  onChange: (level: ReadingLevel) => void;
}

const LEVEL_OPTIONS = [
  { level: 3, label: "Level 3", subtitle: "3rd-4th grade reading", lexile: "520L-820L" },
  { level: 4, label: "Level 4", subtitle: "4th-5th grade reading", lexile: "740L-940L", recommended: true },
  { level: 5, label: "Level 5", subtitle: "6th grade", lexile: "830L-1010L" },
  { level: 6, label: "Level 6", subtitle: "7th grade", lexile: "925L-1070L" },
  { level: 7, label: "Level 7", subtitle: "8th grade+", lexile: "970L-1185L" },
];
```

#### Step 2: Passage Count Selection

```typescript
// components/assessment/PassageCountSelector.tsx
interface PassageCountSelectorProps {
  value: 1 | 3;
  onChange: (count: 1 | 3) => void;
}

const COUNT_OPTIONS = [
  { count: 1, label: "1 Passage", description: "Quick check" },
  { count: 3, label: "3 Passages", description: "Median score (recommended)", recommended: true },
];
```

#### Step 3: Passage Selection

```typescript
// components/assessment/PassageSelector.tsx
interface PassageSelectorProps {
  level: ReadingLevel;
  maxSelections: 1 | 2 | 3;
  selected: string[];
  onChange: (passageIds: string[]) => void;
}

// Shows passages for the selected level
// Checkbox selection (limited to maxSelections)
// Shows: title, word count, lexile, themes, preview snippet
```

### State Management

```typescript
// In dashboard/client.tsx
interface CreateAssessmentState {
  step: 'title' | 'level' | 'count' | 'passages' | 'questions' | 'review';
  title: string;
  readingLevel: ReadingLevel | null;
  passageCount: 1 | 3;
  selectedPassageIds: string[];
  questions: ComprehensionQuestion[];  // Questions per passage (from passage library)
}
```

---

## 5. Student Reading Flow

### Current Flow
```
Enter Name → Read Passage → Answer Questions → Done
```

### New Flow (Multiple Passages)
```
Enter Name → Read Passage 1 → Questions 1 → Read Passage 2 → Questions 2 → Read Passage 3 → Questions 3 → Done
```

### Key Changes

#### Progress Indicator

```typescript
// components/student/ProgressIndicator.tsx
interface ProgressIndicatorProps {
  currentPassage: number;  // 0, 1, 2
  totalPassages: number;   // 1, 2, or 3
}

// Visual: ●───────○───────○ (passage 1 of 3)
```

#### State Tracking

```typescript
// In read/[token]/page.tsx
interface StudentFlowState {
  studentName: string;
  currentPassageIndex: number;
  passages: Passage[];
  completedSessions: string[];  // Session IDs for completed passages
  status: 'name' | 'reading' | 'questions' | 'transition' | 'done';
}
```

#### Transition Screen

```typescript
// components/student/PassageTransition.tsx
// Shown between passages
// "Great job! Ready for passage 2 of 3?"
// [Continue] button
```

#### Completion Screen

```typescript
// Modified done/page.tsx
// "You completed 3 passages. Great work!"
// Shows summary if desired
```

### API Changes

```typescript
// POST /api/sessions (modified)
interface CreateSessionRequest {
  assessment_id: string;
  student_name: string;
  passage_index: number;      // NEW: which passage (0, 1, 2)
  passage_id: string;         // NEW: specific passage ID
}

// The scoring endpoint remains similar but tracks passage_id
```

---

## 6. Scoring & Benchmark Bands

### Smart Period Detection

```typescript
// lib/passages/library.ts (add to existing)
export function detectAssessmentPeriod(date: Date = new Date()): AssessmentPeriod {
  const month = date.getMonth(); // 0-11

  // Sep 1 - Nov 15 → BOY
  if (month >= 8 && month <= 10) return 'BOY';
  // Nov 16 - Feb 28 → MOY
  if (month >= 11 || month <= 1) return 'MOY';
  // Mar 1 - Aug 31 → EOY
  return 'EOY';
}
```

### Benchmark Calculation

```typescript
// lib/scoring/benchmark.ts
import { HASBROUCK_TINDAL_NORMS, BenchmarkBand, AssessmentPeriod } from '../passages/library';

interface BenchmarkResult {
  band: BenchmarkBand;
  label: string;              // "At Benchmark", "Below Benchmark", "Well Below Benchmark"
  wcpm: number;
  percentile: number;         // Approximate percentile
  gradeNorms: {
    p25: number;
    p50: number;
  };
  period: AssessmentPeriod;
}

export function calculateBenchmark(
  wcpm: number,
  readingLevel: ReadingLevel,
  period: AssessmentPeriod
): BenchmarkResult {
  // Map reading level to grade for norm lookup
  const gradeMap: Record<ReadingLevel, 4 | 5 | 6 | 7 | 8> = {
    3: 4,  // Level 3 uses grade 4 norms
    4: 4,  // Level 4 uses grade 4 norms (core use case)
    5: 5,  // Level 5 uses grade 5 norms
    6: 6,  // Level 6 uses grade 6 norms
    7: 7,  // Level 7 uses grade 7 norms
  };

  const grade = gradeMap[readingLevel];
  const norms = HASBROUCK_TINDAL_NORMS[grade][period];

  let band: BenchmarkBand;
  let label: string;
  let percentile: number;

  if (wcpm >= norms.p50) {
    band = 'at';
    label = 'At Benchmark';
    percentile = 50 + ((wcpm - norms.p50) / norms.p50) * 25; // Rough estimate
  } else if (wcpm >= norms.p25) {
    band = 'below';
    label = 'Below Benchmark';
    percentile = 25 + ((wcpm - norms.p25) / (norms.p50 - norms.p25)) * 25;
  } else {
    band = 'well_below';
    label = 'Well Below Benchmark';
    percentile = (wcpm / norms.p25) * 25;
  }

  return {
    band,
    label,
    wcpm,
    percentile: Math.round(Math.max(0, Math.min(99, percentile))),
    gradeNorms: norms,
    period,
  };
}
```

### Median Calculation

```typescript
// lib/scoring/median.ts
export interface MedianResult {
  medianWcpm: number;
  scores: number[];
  benchmark: BenchmarkResult;
}

export function calculateMedianResult(
  sessions: { wcpm: number }[],
  readingLevel: ReadingLevel,
  period: AssessmentPeriod
): MedianResult {
  const scores = sessions.map(s => s.wcpm).sort((a, b) => a - b);

  let medianWcpm: number;
  if (scores.length === 1) {
    medianWcpm = scores[0];
  } else if (scores.length === 2) {
    medianWcpm = Math.round((scores[0] + scores[1]) / 2);
  } else {
    medianWcpm = scores[1]; // Middle of 3
  }

  return {
    medianWcpm,
    scores,
    benchmark: calculateBenchmark(medianWcpm, readingLevel, period),
  };
}
```

---

## 7. Teacher Report Updates

### Report Header

```
┌─────────────────────────────────────────────────────────────────┐
│  Marcus Johnson — Level 4 Assessment                            │
│  November 15, 2024 │ MOY Period │ 3 Passages                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  MEDIAN WCPM: 112          BENCHMARK: AT ✓                │ │
│  │  ════════════════════════════════════════════════════════ │ │
│  │  Well Below (<68)    Below (68-93)    At Benchmark (94+)  │ │
│  │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░████████████ │ │
│  │                                              ▲             │ │
│  │                                             112            │ │
│  │  ────────────────────────────────────────────────────────  │ │
│  │  Grade 4 Norms (MOY): 25th = 93, 50th = 120               │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Individual Passage Scores

```
┌─────────────────────────────────────────────────────────────────┐
│  Passage Scores                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Living on Mars                    98 WCPM   92% accuracy   │
│     338 words │ 820L                  [View Details]            │
│                                                                 │
│  2. The Bridge That Changed Brooklyn  112 WCPM  95% accuracy   │
│     325 words │ 860L                  [View Details] ← MEDIAN  │
│                                                                 │
│  3. The Return of the Wolves          118 WCPM  94% accuracy   │
│     319 words │ 800L                  [View Details]            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Components to Build

```typescript
// components/report/BenchmarkBand.tsx
interface BenchmarkBandProps {
  result: BenchmarkResult;
  showNorms?: boolean;
}

// components/report/MedianScoreSummary.tsx
interface MedianScoreSummaryProps {
  medianResult: MedianResult;
  period: AssessmentPeriod;
  readingLevel: ReadingLevel;
}

// components/report/PassageScoreList.tsx
interface PassageScoreListProps {
  sessions: SessionWithPassage[];
  medianWcpm: number;
}
```

---

## 8. Implementation Phases

### Phase 1: Database & Core Infrastructure (Day 1)

- [ ] Create migration `0016_passage_library_schema.sql`
- [ ] Run migration locally and test
- [ ] Update TypeScript types for Assessment and Session
- [ ] Delete old `lib/passages.ts`
- [ ] Update imports throughout codebase to use new library

### Phase 2: Assessment Creation UI (Day 1-2)

- [ ] Build `ReadingLevelSelector` component
- [ ] Build `PassageCountSelector` component
- [ ] Build `PassageSelector` component
- [ ] Update `dashboard/client.tsx` with new creation flow
- [ ] Update `POST /api/assessments` to handle new fields
- [ ] Test creating assessments with 1 and 3 passages

### Phase 3: Student Reading Flow (Day 2-3)

- [ ] Build `ProgressIndicator` component
- [ ] Build `PassageTransition` component
- [ ] Update `read/[token]/page.tsx` for multi-passage state
- [ ] Update recording flow to track passage_index
- [ ] Update comprehension flow per passage
- [ ] Update done page for multi-passage completion
- [ ] Test full student flow with 3 passages

### Phase 4: Scoring & Reports (Day 3-4)

- [ ] Implement `calculateBenchmark()` function
- [ ] Implement `calculateMedianResult()` function
- [ ] Implement `detectAssessmentPeriod()` function
- [ ] Build `BenchmarkBand` component
- [ ] Build `MedianScoreSummary` component
- [ ] Update report page with new components
- [ ] Add period override dropdown (optional)
- [ ] Test benchmark calculations

### Phase 5: Testing & Polish (Day 4)

- [ ] End-to-end test: Create assessment → Student reads 3 passages → View report
- [ ] Test edge cases (1 passage, 2 passages)
- [ ] Test benchmark bands at different times of year
- [ ] Verify mobile responsiveness
- [ ] Run lint and build
- [ ] Update STATUS.md

---

## 9. Files Changed Summary

### New Files
```
lib/passages/level3-passages.ts    ✅ Already built
lib/passages/level4-passages.ts    ✅ Already built
lib/passages/level5-passages.ts    ✅ Already built
lib/passages/level6-passages.ts    ✅ Already built
lib/passages/level7-passages.ts    ✅ Already built
lib/passages/library.ts            ✅ Already built
lib/scoring/benchmark.ts           To build
components/assessment/ReadingLevelSelector.tsx    To build
components/assessment/PassageCountSelector.tsx    To build
components/assessment/PassageSelector.tsx         To build
components/student/ProgressIndicator.tsx          To build
components/student/PassageTransition.tsx          To build
components/report/BenchmarkBand.tsx               To build
components/report/MedianScoreSummary.tsx          To build
supabase/migrations/0016_passage_library_schema.sql  To build
```

### Modified Files
```
app/dashboard/client.tsx           Heavy changes (new creation flow)
app/read/[token]/page.tsx          Heavy changes (multi-passage flow)
app/read/[token]/record/page.tsx   Moderate changes (passage tracking)
app/read/[token]/done/page.tsx     Light changes (completion message)
app/report/[id]/page.tsx           Heavy changes (benchmark display)
app/api/assessments/route.ts       Moderate changes (new fields)
```

### Deleted Files
```
lib/passages.ts                    Remove old demo passages
```

---

## 10. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking existing assessments | Migration handles NULL values gracefully; old assessments work without new fields |
| Student flow confusion | Clear progress indicator and transition screens |
| Wrong benchmark period selected | Auto-detect with visible indicator; teacher can override |
| Performance with 3 recordings | Each passage scored independently; no blocking |

---

## 11. Success Criteria

- [ ] Teacher can create assessment selecting reading level (3-7)
- [ ] Teacher can choose 1 or 3 passages
- [ ] Student completes all passages in sequence
- [ ] Report shows median WCPM for multi-passage assessments
- [ ] Report shows At/Below/Well Below benchmark band
- [ ] Assessment period auto-detected from date
- [ ] All existing functionality still works
- [ ] Build passes (`npm run build`)

---

## 12. Decisions Made

1. **Passage count options:** 1 or 3 only (no 2)
   - Median of 2 is just average, less meaningful statistically

2. **Comprehension questions:** After EACH passage
   - 3 passages = 9 questions total (3 per passage)
   - Keeps flow consistent regardless of passage count

3. **Assessment period:** Auto-detect only, no manual override
   - Simpler implementation, less UI clutter
   - Period detected from date when assessment is created
   - Stored on assessment record for consistency

---

## Appendix: Hasbrouck-Tindal Norms Reference

| Grade | BOY 25th | BOY 50th | MOY 25th | MOY 50th | EOY 25th | EOY 50th |
|-------|----------|----------|----------|----------|----------|----------|
| 4 | 68 | 94 | 93 | 120 | 105 | 133 |
| 5 | 95 | 121 | 109 | 133 | 119 | 146 |
| 6 | 106 | 132 | 116 | 145 | 130 | 162 |
| 7 | 102 | 128 | 109 | 136 | 123 | 150 |
| 8 | 106 | 133 | 115 | 146 | 124 | 151 |

Source: Hasbrouck & Tindal (2017)
