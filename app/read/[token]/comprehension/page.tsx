"use client";

import { useState, useEffect, Suspense, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { playTick, playChime } from "@/lib/audio/sounds";
import { createClient } from "@/lib/supabase/browser";
import { getPassageById } from "@/lib/passages/library";

interface Question {
  id: string;
  question: string;
  question_type: "literal" | "inferential";
  display_order: number;
}

interface Passage {
  id: string;
  title: string;
  text: string;
}

interface ComprehensionPageProps {
  params: Promise<{ token: string }>;
}

function ComprehensionContent({ token }: { token: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("s");
  const passageIndex = parseInt(searchParams.get("pi") || "0", 10);
  const totalPassages = parseInt(searchParams.get("tp") || "1", 10);
  const supabase = createClient();

  const [state, setState] = useState<"loading" | "ready" | "submitting" | "error">("loading");
  const [passage, setPassage] = useState<Passage | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentQuestion, setCurrentQuestion] = useState(0);

  // Build done URL with passage tracking params
  const buildDoneUrl = () => {
    const params = new URLSearchParams({ s: sessionId || "" });
    params.set("pi", passageIndex.toString());
    params.set("tp", totalPassages.toString());
    return `/read/${token}/done?${params.toString()}`;
  };

  // Load passage and questions
  useEffect(() => {
    async function loadData() {
      if (!sessionId) {
        setState("error");
        return;
      }

      // Get session with passage info - both library and legacy fields
      const { data: session, error: sessionError } = await supabase
        .from("sessions")
        .select(`
          passage_id,
          assessments(
            passage_id,
            passage_ids,
            passages(id, title, text)
          )
        `)
        .eq("id", sessionId)
        .single();

      if (sessionError || !session) {
        console.error("Error loading session:", sessionError);
        router.replace(buildDoneUrl());
        return;
      }

      // Extract assessment from nested relations
      const assessments = session.assessments as unknown as {
        passage_id: string | null;
        passage_ids: string[] | null;
        passages: Passage | null;
      } | null;

      let passageData: Passage | null = null;
      let passageIdForQuestions: string | null = null;

      // Check for library passage first (session.passage_id is the library passage ID)
      if (session.passage_id) {
        const libraryPassage = getPassageById(session.passage_id);
        if (libraryPassage) {
          passageData = {
            id: libraryPassage.id,
            title: libraryPassage.title,
            text: libraryPassage.text,
          };
          passageIdForQuestions = libraryPassage.id;
        }
      }
      // Fall back to legacy database passage
      else if (assessments?.passages) {
        passageData = assessments.passages;
        passageIdForQuestions = assessments.passages.id;
      }

      if (!passageData) {
        // No passage found, skip to done
        router.replace(buildDoneUrl());
        return;
      }

      setPassage(passageData);

      // For library passages, questions are embedded in the passage
      // For DB passages, fetch from passage_questions table
      if (session.passage_id) {
        // Library passage - get questions from passage object
        const libraryPassage = getPassageById(session.passage_id);
        if (libraryPassage?.questions && libraryPassage.questions.length > 0) {
          const formattedQuestions: Question[] = libraryPassage.questions.map((q, idx) => ({
            id: `lib-${session.passage_id}-${idx}`,
            question: q.question,
            question_type: q.type,
            display_order: idx,
          }));
          setQuestions(formattedQuestions);
          setState("ready");
          return;
        } else {
          // No questions for this library passage, skip to done
          router.replace(buildDoneUrl());
          return;
        }
      }

      // Legacy DB passage - fetch questions from database
      const { data: questionRows, error: questionsError } = await supabase
        .from("passage_questions")
        .select("id, question, question_type, display_order")
        .eq("passage_id", passageIdForQuestions)
        .order("display_order", { ascending: true });

      if (questionsError || !questionRows || questionRows.length === 0) {
        // No questions, skip to done
        router.replace(buildDoneUrl());
        return;
      }

      setQuestions(questionRows);
      setState("ready");
    }

    loadData();
  }, [sessionId, token, router, supabase]);

  const handleAnswerChange = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleNext = () => {
    if (currentQuestion < questions.length - 1) {
      playTick();
      setCurrentQuestion(currentQuestion + 1);
    }
  };

  const handlePrev = () => {
    if (currentQuestion > 0) {
      playTick();
      setCurrentQuestion(currentQuestion - 1);
    }
  };

  const handleSubmit = async () => {
    if (!sessionId) return;

    setState("submitting");

    try {
      const response = await fetch("/api/comprehension", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          answers,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to submit comprehension");
      }

      playChime();
      router.push(buildDoneUrl());
    } catch (error) {
      console.error("Comprehension submit error:", error);
      // Still redirect even if there's an error
      router.push(buildDoneUrl());
    }
  };

  // Loading state - question skeleton
  if (state === "loading") {
    return (
      <div className="min-h-screen bg-paper flex flex-col">
        <div className="pt-8 px-6">
          <div className="max-w-[600px] mx-auto">
            <div className="skeleton-shimmer h-4 w-32 rounded mb-2" />
            <div className="skeleton-shimmer h-6 w-48 rounded" />
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center px-6 py-8">
          <div className="max-w-[600px] w-full space-y-6">
            <div className="skeleton-shimmer h-6 w-24 rounded-full" />
            <div className="skeleton-shimmer h-8 w-full rounded" />
            <div className="skeleton-shimmer h-32 w-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  // Error state - calm serif design
  if (state === "error" || questions.length === 0) {
    return (
      <div className="min-h-screen bg-paper flex flex-col items-center justify-center px-6">
        <p className="font-serif text-xl text-ink italic text-center">
          Unable to load questions.
        </p>
        <p className="text-sm text-stone mt-2 text-center">
          Your reading has been saved.
        </p>
      </div>
    );
  }

  const currentQ = questions[currentQuestion];
  const answeredCount = Object.values(answers).filter((a) => a.trim()).length;
  const allAnswered = answeredCount === questions.length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.24 }}
      className="min-h-screen bg-paper flex flex-col"
    >
      {/* Flow progress indicator */}
      <div className="pt-10 px-6">
        <div className="max-w-[600px] mx-auto flex items-center justify-center gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-success" />
            <span className="text-stone">Name</span>
          </div>
          <span className="text-mist">─</span>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-success" />
            <span className="text-stone">Reading</span>
          </div>
          <span className="text-mist">─</span>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent-blue" />
            <span className="text-ink font-medium">Questions</span>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="pt-16 px-6">
        <div className="max-w-[600px] mx-auto">
          <h1 className="font-serif text-xl font-semibold text-ink mb-1">
            Answer questions about what you read
          </h1>
          <p className="text-sm text-stone">
            {passage?.title}
          </p>
        </div>
      </div>

      {/* Progress indicator */}
      <div className="px-6 pt-3">
        <div className="max-w-[600px] mx-auto">
          <div className="flex gap-2">
            {questions.map((_, idx) => (
              <div
                key={idx}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  idx === currentQuestion
                    ? "bg-accent-blue"
                    : answers[questions[idx].id]?.trim()
                    ? "bg-success"
                    : "bg-mist"
                }`}
              />
            ))}
          </div>
          <p className="text-xs text-stone mt-2">
            Question {currentQuestion + 1} of {questions.length}
          </p>
        </div>
      </div>

      {/* Question card */}
      <div className="flex items-start justify-center px-6 pt-12 pb-8">
        <div className="max-w-[600px] w-full">
          <motion.div
            key={currentQuestion}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Question type badge */}
            <span
              className={`inline-block text-xs px-3 py-1 rounded-full mb-4 ${
                currentQ.question_type === "literal"
                  ? "bg-accent-blue/10 text-accent-blue"
                  : "bg-warning/10 text-warning"
              }`}
            >
              {currentQ.question_type === "literal" ? "From the story" : "What do you think?"}
            </span>

            {/* Question */}
            <p className="font-serif text-2xl text-ink mb-6">
              {currentQ.question}
            </p>

            {/* Answer textarea */}
            <div className="relative">
              <label className="block text-sm font-medium text-ink mb-2">
                Your answer
              </label>
              <textarea
                value={answers[currentQ.id] || ""}
                onChange={(e) => handleAnswerChange(currentQ.id, e.target.value)}
                placeholder="Type your answer here..."
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                className="w-full h-36 p-4 border-2 border-mist rounded-xl bg-white text-ink font-serif text-lg resize-none focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue shadow-sm"
              />
            </div>

            {/* First question tip */}
            {currentQuestion === 0 && (
              <div className="flex items-start gap-2 mt-4 text-xs text-stone">
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Take your time. You can go back to change your answers.</span>
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {/* Navigation */}
      <div className="pb-8 px-6">
        <div className="max-w-[600px] mx-auto flex justify-between items-center">
          <button
            onClick={handlePrev}
            disabled={currentQuestion === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm text-stone border border-mist rounded-lg hover:bg-mist/30 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Previous
          </button>

          {currentQuestion === questions.length - 1 ? (
            <Button
              onClick={handleSubmit}
              disabled={!allAnswered || state === "submitting"}
              className="bg-accent-blue text-paper px-8 py-3 h-auto rounded-lg hover:bg-accent-blue/90 disabled:opacity-50"
            >
              {state === "submitting" ? "Submitting..." : "Submit answers"}
            </Button>
          ) : (
            <button
              onClick={handleNext}
              className="flex items-center gap-2 px-4 py-2 text-sm text-accent-blue border border-accent-blue/30 rounded-lg hover:bg-accent-blue/10 transition-colors"
            >
              Next
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>

        {!allAnswered && currentQuestion === questions.length - 1 && (
          <p className="text-center text-sm text-stone mt-4">
            Please answer all {questions.length} questions to continue.
          </p>
        )}
      </div>
    </motion.div>
  );
}

export default function ComprehensionPage({ params }: ComprehensionPageProps) {
  const { token } = use(params);

  return (
    <Suspense fallback={<div className="min-h-screen bg-paper" />}>
      <ComprehensionContent token={token} />
    </Suspense>
  );
}
