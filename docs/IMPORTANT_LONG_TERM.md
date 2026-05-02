# Long-Term: AI Reliability & Human Oversight

## The Problem

As teachers rely more on AI output, they may stop verifying results (e.g., listening to recordings). If AI fails silently (bugs, model drift, edge cases), errors propagate to grade books unnoticed.

**Goal:** Create an intermediary mechanism between AI processing and teacher consumption that flags potential issues.

---

## Industry Analogies

| Domain | Mechanism |
|--------|-----------|
| Medical Labs | Delta checks (flag drastic changes from previous results), critical value alerts |
| Aviation | "Unreliable airspeed" warnings when sensors disagree |
| Manufacturing | Statistical Process Control - flag drift before it becomes defect |
| Finance | Unusual transactions flagged for human review |

---

## Potential Mechanisms

### 1. Reliability Score
Prominent visual indicator (High/Medium/Low) based on:
- ASR confidence scores
- Audio quality metrics
- Internal consistency checks

### 2. Anomaly Flags
Auto-warn when:
- Results are statistical outliers for grade level
- Student performance differs drastically from history
- Accuracy % doesn't match visible error count
- Audio has quality issues (noise, clipping, silence)

### 3. Mandatory Spot-Checks
- Force listening to X% of recordings
- Randomly hide scores until teacher listens
- Periodic audits

### 4. "Review Required" State
Low-confidence assessments don't auto-complete - require teacher acknowledgment.

---

## Design Tension

Balance between:
- **Trust** - let teachers work efficiently
- **Verification** - catch AI errors
- **Friction** - don't make tool annoying

---

## Status

**Parked for future implementation.** Revisit when scaling.

---

# Long-Term: Teacher Feedback Loop for AI Improvement

## The Opportunity

Teachers reviewing AI assessments will correct errors—fixing mispronunciation labels, adjusting accuracy scores, etc. This feedback is invaluable for improving AI performance.

## The Constraint

NYC DOE policy prohibits using student data for AI training. Student recordings and associated data cannot be sent to model providers for fine-tuning.

## Compliant Approaches to Explore

### 1. Prompt Engineering (Not Model Training)
- Analyze *categories* of teacher corrections
- Use insights to refine system prompts, rubrics, and instructions
- No student data leaves the system or trains any model
- Example: "AI frequently marks 'gonna' as mispronunciation → update prompt to handle informal contractions"

### 2. Aggregate Pattern Analysis
- Track correction types at aggregate level: "Hesitation detection: 73% accurate"
- Statistics about AI performance ≠ student data
- Informs which areas need improvement without exposing individuals

### 3. Teacher-Generated Training Data
- Teachers/adult volunteers record themselves making common student error patterns
- Purpose-built calibration set with full consent
- Mimics real scenarios without using actual student recordings

### 4. Synthetic Data Generation
- Use correction *categories* to generate synthetic examples via TTS
- Intentional error patterns without real student audio
- Could supplement or validate AI behavior

### 5. Rule-Based Corrections
- Certain patterns become explicit rules rather than model-learned behavior
- Example: "Ignore pauses < 0.5s between words" as a rule, not a trained behavior

## Questions to Clarify with DOE

- Does "AI training" include prompt engineering and rule adjustments?
- Are de-identified aggregate statistics about AI accuracy considered "student data"?
- Can teacher-generated demonstration recordings be used for calibration?

## Status

**Concept stage.** Requires policy clarification before implementation.
