# Passage Library Plan

## Overview

This document outlines the passage library for FluencyScope's median-of-3 ORF assessment protocol.

## Structure

Passages are organized by **reading level** (not grade), with 3 equivalent passages per level to support the median-of-3 protocol.

| Level | Lexile Range | Target Readers | Word Count Target |
|-------|--------------|----------------|-------------------|
| 3 | 520L – 820L | Struggling MS (reading at 3rd-4th grade) | 300-350 words |
| 4 | 740L – 940L | Below-grade MS (reading at 4th-5th grade) | 350-400 words |
| 5 | 830L – 1010L | On-grade 6th | 400-450 words |
| 6 | 925L – 1070L | On-grade 7th | 400-450 words |
| 7 | 970L – 1185L | On-grade 8th / Advanced | 450-500 words |

## Passage Sources & Excerpt Guidance

### Level 3 (520L – 820L)

#### Passage 3A: "Thank You, M'am" by Langston Hughes
- **Source**: CommonLit (free account required)
- **Lexile**: 670L
- **Full length**: ~1,200 words
- **Excerpt**: Use paragraphs 1-8 (the encounter and Mrs. Jones dragging Roger home)
- **Target excerpt**: ~320 words
- **Comprehension themes**: Character motivation, cause/effect, inference about Mrs. Jones's intentions
- **Why it works**: Self-contained opening scene, clear action, relatable urban setting

#### Passage 3B: "Seventh Grade" by Gary Soto
- **Source**: CommonLit or textbook anthologies
- **Lexile**: 730L
- **Full length**: ~1,500 words
- **Excerpt**: Use the opening through Victor choosing French class
- **Target excerpt**: ~300 words
- **Comprehension themes**: Character motivation, setting, making predictions
- **Why it works**: Highly relatable to middle schoolers, humor, clear narrative

#### Passage 3C: "Rikki-Tikki-Tavi" by Rudyard Kipling (PUBLIC DOMAIN)
- **Source**: Project Gutenberg (free)
- **Lexile**: 810L
- **Full length**: ~3,600 words
- **Excerpt**: Opening paragraphs introducing the mongoose and his arrival at the bungalow
- **Target excerpt**: ~350 words
- **Comprehension themes**: Character traits, setting details, cause/effect
- **Why it works**: Public domain, adventure narrative, vivid description

---

### Level 4 (740L – 940L) — CORE USE CASE

#### Passage 4A: "Fish Cheeks" by Amy Tan
- **Source**: CommonLit
- **Lexile**: 910L
- **Full length**: ~650 words
- **Excerpt**: Can use nearly the full text (trim to ~400 words if needed)
- **Target excerpt**: ~400 words
- **Comprehension themes**: Cultural identity, embarrassment, family, inference
- **Why it works**: Already short, culturally relevant, strong theme

#### Passage 4B: "The Scholarship Jacket" by Marta Salinas
- **Source**: Great Books Foundation or textbook anthologies
- **Lexile**: 770L
- **Full length**: ~1,968 words
- **Excerpt**: Opening through Martha overhearing the teachers' conversation
- **Target excerpt**: ~380 words
- **Comprehension themes**: Fairness, discrimination, character response to conflict
- **Why it works**: Culturally relevant, clear conflict, relatable school setting

#### Passage 4C: "All Summer in a Day" by Ray Bradbury
- **Source**: CommonLit or Lexia resources
- **Lexile**: 710L
- **Full length**: ~2,300 words
- **Excerpt**: Opening through the children's anticipation of the sun
- **Target excerpt**: ~350 words
- **Comprehension themes**: Setting (Venus), mood, character (Margot as outsider)
- **Why it works**: Vivid sci-fi setting, strong sensory details, clear narrative setup

---

### Level 5 (830L – 1010L)

#### Passage 5A: "Herd Behavior" by CommonLit Staff
- **Source**: CommonLit
- **Lexile**: ~950L
- **Full length**: ~500 words
- **Excerpt**: Full text or near-full
- **Comprehension themes**: Psychology, conformity, main idea, evidence
- **Why it works**: Nonfiction, informational, good length

#### Passage 5B: "Who is Katherine Johnson?" by NASA
- **Source**: CommonLit
- **Lexile**: ~980L
- **Full length**: ~400 words
- **Excerpt**: Full text
- **Comprehension themes**: Biography, STEM, main idea, historical significance
- **Why it works**: Nonfiction, inspirational, culturally relevant

#### Passage 5C: "Charles" by Shirley Jackson
- **Source**: CommonLit
- **Lexile**: 760L (slightly below band but thematically appropriate)
- **Full length**: ~1,200 words
- **Excerpt**: Opening through Laurie's first week of kindergarten stories
- **Target excerpt**: ~400 words
- **Comprehension themes**: Inference, unreliable narrator (setup for twist), family dynamics
- **Why it works**: Engaging narrative, builds suspense, relatable

---

### Level 6 (925L – 1070L)

#### Passage 6A: "How Jackie Robinson Changed Baseball" by Jessica McBirney
- **Source**: CommonLit
- **Lexile**: ~1050L
- **Full length**: ~600 words
- **Excerpt**: Opening through Robinson joining the Dodgers
- **Target excerpt**: ~420 words
- **Comprehension themes**: Civil rights, sports history, cause/effect, main idea
- **Why it works**: Nonfiction, culturally significant, clear structure

#### Passage 6B: Nonfiction - TBD (Science/STEM topic)
- **Source**: ReadWorks or CommonLit
- **Lexile**: 1000L-1070L
- **Recommendation**: Find a passage about space exploration, technology, or environmental science

#### Passage 6C: Fiction - TBD
- **Source**: CommonLit
- **Lexile**: 1000L-1070L
- **Recommendation**: Look for contemporary realistic fiction

---

### Level 7 (970L – 1185L)

#### Passage 7A: Nonfiction - "Print Your Own Medicine" or similar
- **Source**: Lexile ORF resources or ReadWorks
- **Lexile**: 1030L
- **Full length**: 474 words
- **Excerpt**: Full text
- **Comprehension themes**: Technology, future, main idea, inference
- **Why it works**: Perfect length, engaging topic

#### Passage 7B & 7C: TBD
- **Source**: CommonLit, ReadWorks
- **Lexile**: 1050L-1185L
- **Recommendation**: Mix of fiction and nonfiction at this level

---

## JSON Structure

Passages will be stored in `lib/passages/library.ts`:

```typescript
export interface PassageMetadata {
  id: string;
  title: string;
  author: string;
  source: 'public_domain' | 'commonlit' | 'readworks' | 'original';
  lexile: number;
  reading_level: 3 | 4 | 5 | 6 | 7;
  form: 'A' | 'B' | 'C';  // For equivalent forms in median-of-3
  word_count: number;
  genre: 'fiction' | 'nonfiction' | 'memoir';
  themes: string[];
  grade_content: string;  // Age-appropriate content level (e.g., "6-8")
}

export interface Passage extends PassageMetadata {
  text: string;
  questions: ComprehensionQuestion[];
}
```

---

## Next Steps

1. [ ] Create CommonLit educator account to access full texts
2. [ ] Pull exact excerpts from each source
3. [ ] Verify Lexile levels using the Lexile Analyzer
4. [ ] Write 3 comprehension questions per passage (2 literal, 1 inferential)
5. [ ] Add passages to `lib/passages/library.ts`
6. [ ] Update assessment creation flow to allow level-based passage selection
7. [ ] Implement median-of-3 scoring logic

---

## Hasbrouck-Tindal Norm Reference

For scoring against benchmarks:

| Grade | BOY 50th | MOY 50th | EOY 50th |
|-------|----------|----------|----------|
| 4 | 94 | 120 | 133 |
| 5 | 121 | 133 | 146 |
| 6 | 132 | 145 | 162 |
| 7 | 128 | 136 | 150 |
| 8 | 133 | 146 | 151 |

Benchmark bands:
- **At Benchmark**: >= 50th percentile
- **Below Benchmark**: 25th-49th percentile
- **Well Below Benchmark**: < 25th percentile
