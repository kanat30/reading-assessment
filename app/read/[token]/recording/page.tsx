"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useEffect, Suspense, use } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { v4 as uuidv4 } from "uuid";
import { BreathingDot } from "@/components/BreathingDot";
import { UploadProgress } from "@/lib/audio/upload";
import { playTick, playError } from "@/lib/audio/sounds";
import { createClient } from "@/lib/supabase/browser";
import { getPassageById, Passage as LibraryPassage } from "@/lib/passages/library";
import { ProgressIndicator } from "@/components/student";

type RecordingState =
  | "loading"
  | "not-found"
  | "checking-mic"
  | "mic-denied"
  | "ready"
  | "initializing"
  | "countdown"
  | "recording"
  | "uploading"
  | "offline"
  | "error";

interface DatabasePassage {
  id: string;
  title: string;
  text: string;
  grade_band: string;
  word_count: number;
}

// Unified passage interface for display
interface DisplayPassage {
  id: string;
  title: string;
  text: string;
  word_count: number;
}

interface Assessment {
  id: string;
  class_label: string;
  share_token: string;
  passages: DatabasePassage | null; // Legacy database passage
  // New library passage fields
  passage_ids?: string[];
  reading_level?: number;
}

// Session storage key for passage index in multi-passage flow
const PASSAGE_INDEX_KEY = "fs:passage-index";

interface RecordingPageProps {
  params: Promise<{ token: string }>;
}

const STUDENT_NAME_KEY = "fs:student-name";

function RecordingContent({ token }: { token: string }) {
  const router = useRouter();
  const supabase = createClient();

  const [state, setState] = useState<RecordingState>("loading");
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [studentName, setStudentName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [elapsedTime, setElapsedTime] = useState(0);
  const [countdownValue, setCountdownValue] = useState<number | "Go!">(3);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(
    null
  );
  const [audioLevel, setAudioLevel] = useState(0);
  const [hasDetectedAudio, setHasDetectedAudio] = useState(false);

  // Multi-passage support
  const [currentPassageIndex, setCurrentPassageIndex] = useState(0);
  const [currentPassage, setCurrentPassage] = useState<DisplayPassage | null>(null);
  const [totalPassages, setTotalPassages] = useState(1);

  // Audio recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioChunksRef = useRef<Blob[]>([]); // Store chunks in memory instead of IndexedDB
  const audioSessionIdRef = useRef<string>(uuidv4());
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Start monitoring audio levels to show visual feedback
  const startAudioLevelMonitoring = (stream: MediaStream) => {
    try {
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      analyser.fftSize = 256;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const updateLevel = () => {
        if (!analyserRef.current) return;

        analyserRef.current.getByteFrequencyData(dataArray);
        // Calculate average amplitude
        const sum = dataArray.reduce((a, b) => a + b, 0);
        const average = sum / dataArray.length;
        // Normalize to 0-1 range
        const normalizedLevel = Math.min(average / 128, 1);

        setAudioLevel(normalizedLevel);

        // Mark if we've detected any significant audio
        if (normalizedLevel > 0.05) {
          setHasDetectedAudio(true);
        }

        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };

      updateLevel();
    } catch (e) {
      console.warn("Audio level monitoring not available:", e);
    }
  };

  const stopAudioLevelMonitoring = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
  };

  // Verify stream is still active and has working tracks
  const isStreamActive = (stream: MediaStream): boolean => {
    const tracks = stream.getAudioTracks();
    if (tracks.length === 0) return false;

    const track = tracks[0];
    return track.readyState === "live" && track.enabled && !track.muted;
  };

  const acquireMicrophone = async () => {
    setState("checking-mic");

    try {
      // Request mic with explicit constraints for better audio capture
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          // Prefer default device but don't fail if constraints not met
          channelCount: { ideal: 1 },
          sampleRate: { ideal: 48000 },
        }
      });
      streamRef.current = stream;

      // Wait for audio track to be fully live (handles hardware warm-up)
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack && audioTrack.readyState !== "live") {
        await new Promise<void>((resolve) => {
          const checkState = () => {
            if (audioTrack.readyState === "live") {
              resolve();
            } else {
              requestAnimationFrame(checkState);
            }
          };
          checkState();
        });
      }

      setState("ready");
    } catch (err) {
      console.error("Microphone access error:", err);

      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setState("mic-denied");
      } else {
        setState("error");
        setErrorMessage(
          "Unable to access microphone. Please check your browser settings."
        );
      }
    }
  };

  // Load assessment and student name
  useEffect(() => {
    async function loadAssessment() {
      // Get student name from session storage
      const savedName = sessionStorage.getItem(STUDENT_NAME_KEY);
      if (!savedName) {
        // No name, redirect back to landing
        router.replace(`/read/${token}`);
        return;
      }
      setStudentName(savedName);

      // Get passage index from session storage (for multi-passage flow)
      const savedIndex = sessionStorage.getItem(PASSAGE_INDEX_KEY);
      const passageIndex = savedIndex ? parseInt(savedIndex, 10) : 0;
      setCurrentPassageIndex(passageIndex);

      // Fetch assessment with both legacy and new fields
      const { data, error } = await supabase
        .from("assessments")
        .select("*, passages(*), passage_ids, reading_level")
        .eq("share_token", token)
        .single();

      if (error || !data) {
        setState("not-found");
        return;
      }

      // Check if expired
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        setState("not-found");
        return;
      }

      setAssessment(data);

      // Determine which passage to use
      if (data.passage_ids && data.passage_ids.length > 0) {
        // New library passage flow
        setTotalPassages(data.passage_ids.length);
        const passageId = data.passage_ids[passageIndex];
        const libraryPassage = getPassageById(passageId);
        if (libraryPassage) {
          setCurrentPassage({
            id: libraryPassage.id,
            title: libraryPassage.title,
            text: libraryPassage.text,
            word_count: libraryPassage.word_count,
          });
        } else {
          setState("not-found");
          return;
        }
      } else if (data.passages) {
        // Legacy database passage flow
        setTotalPassages(1);
        setCurrentPassage({
          id: data.passages.id,
          title: data.passages.title,
          text: data.passages.text,
          word_count: data.passages.word_count,
        });
      } else {
        setState("not-found");
        return;
      }

      // Request mic access immediately - this triggers browser permission prompt
      acquireMicrophone();
    }

    loadAssessment();

    return () => {
      // Cleanup on unmount
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      // Stop audio level monitoring
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const startActualRecording = async () => {
    const mediaRecorder = mediaRecorderRef.current;
    const stream = streamRef.current;

    if (!mediaRecorder || !stream) {
      console.error("No mediaRecorder or stream available");
      setState("error");
      setErrorMessage("Failed to start recording. Please refresh and try again.");
      return;
    }

    try {
      // Start recording - just call start, don't wait for onstart event
      mediaRecorder.start(1000);

      startTimeRef.current = Date.now();
      setState("recording");

      // Start audio level monitoring for visual feedback
      startAudioLevelMonitoring(stream);

      // Play tick sound
      playTick();

      // Start timer
      timerRef.current = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } catch (err) {
      console.error("Failed to start recording:", err);
      setState("error");
      setErrorMessage("Failed to start recording. Please refresh and try again.");
    }
  };

  const runCountdown = () => {
    // Use a sequential approach for more reliable animation timing
    const sequence: Array<{ value: number | "Go!"; delay: number }> = [
      { value: 3, delay: 0 },
      { value: 2, delay: 1000 },
      { value: 1, delay: 2000 },
      { value: "Go!", delay: 3000 },
    ];

    let currentIndex = 0;
    setCountdownValue(3);
    setState("countdown");

    const runNextStep = () => {
      currentIndex++;

      if (currentIndex < sequence.length) {
        playTick();
        setCountdownValue(sequence[currentIndex].value);

        // Schedule next step
        const nextDelay = sequence[currentIndex + 1]
          ? sequence[currentIndex + 1].delay - sequence[currentIndex].delay
          : 700; // After "Go!", wait 700ms before starting

        setTimeout(runNextStep, nextDelay);
      } else {
        // Countdown complete, start recording
        startActualRecording();
      }
    };

    // Start the sequence after showing "3" for 1 second
    setTimeout(runNextStep, 1000);
  };

  const handleStartRecording = async () => {
    // Always get a fresh stream right before recording to avoid stale streams
    setState("initializing");

    let stream: MediaStream;
    try {
      // Stop any existing stream first
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      // Get fresh stream with simple constraints
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true
      });
      streamRef.current = stream;
    } catch (err) {
      console.error("Failed to get microphone:", err);
      setState("mic-denied");
      return;
    }

    // Reset audio detection state
    setHasDetectedAudio(false);

    // Find a supported mimeType
    const mimeTypes = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg",
    ];
    let mimeType = "";
    for (const type of mimeTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        mimeType = type;
        break;
      }
    }

    // Configure MediaRecorder
    const options: MediaRecorderOptions = { audioBitsPerSecond: 64000 };
    if (mimeType) {
      options.mimeType = mimeType;
    }

    const mediaRecorder = new MediaRecorder(stream, options);

    mediaRecorderRef.current = mediaRecorder;
    audioChunksRef.current = []; // Clear any previous chunks

    // Generate new session ID for this recording
    audioSessionIdRef.current = uuidv4();

    // Handle incoming chunks - store directly in memory (simpler, works in incognito)
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunksRef.current.push(event.data);
      }
    };

    // Start countdown - recording will begin after 3-2-1-Go!
    runCountdown();
  };

  const handleStop = async () => {
    if (!mediaRecorderRef.current || state !== "recording" || !assessment) return;

    // Clear timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Stop audio level monitoring
    stopAudioLevelMonitoring();

    setState("uploading");

    const mediaRecorder = mediaRecorderRef.current;
    const durationSeconds = (Date.now() - startTimeRef.current) / 1000;

    // Wait for final data
    await new Promise<void>((resolve) => {
      mediaRecorder.onstop = () => resolve();
      mediaRecorder.stop();
    });

    // Stop all tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // Check if we have any audio chunks
    if (audioChunksRef.current.length === 0) {
      setState("error");
      playError();
      setErrorMessage("No audio was recorded. Please try again.");
      return;
    }

    // Assemble audio blob from in-memory chunks
    const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });

    // Check if blob has meaningful data
    if (audioBlob.size < 1000) {
      setState("error");
      playError();
      setErrorMessage("Recording was too short. Please try again.");
      return;
    }

    setUploadProgress({ status: "uploading", attempt: 1, maxAttempts: 3, message: "Uploading..." });

    // Upload directly without IndexedDB
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");
      formData.append("assessment_token", token);
      formData.append("student_name", studentName);
      formData.append("duration_seconds", durationSeconds.toString());

      // Add passage tracking for multi-passage and library passage support
      if (currentPassage) {
        formData.append("passage_id", currentPassage.id);
        formData.append("passage_index", currentPassageIndex.toString());
      }

      const response = await fetch("/api/score", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`);
      }

      const { session_id } = await response.json();

      setUploadProgress({ status: "success", attempt: 1, maxAttempts: 3, message: "Done!" });
      playTick();

      // Navigate to comprehension with passage tracking info
      const searchParams = new URLSearchParams({
        s: session_id,
        pi: currentPassageIndex.toString(),
        tp: totalPassages.toString(),
      });
      router.push(`/read/${token}/comprehension?${searchParams.toString()}`);
      return;
    } catch (err) {
      console.error("Upload error:", err);
      setState("error");
      playError();
      setErrorMessage("Failed to upload recording. Please check your connection and try again.");
      return;
    }
  };

  const handleRetry = async () => {
    // Reset state
    audioChunksRef.current = [];
    setErrorMessage("");
    setElapsedTime(0);
    setUploadProgress(null);
    setHasDetectedAudio(false);
    audioSessionIdRef.current = uuidv4();
    setState("ready");
  };

  const handleRefreshPermission = () => {
    // Instructions vary by browser, but user needs to refresh
    window.location.reload();
  };

  // Loading state - passage skeleton
  if (state === "loading") {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center px-6 py-24">
        <div className="max-w-[680px] w-full">
          <div className="skeleton-shimmer h-4 w-32 rounded mb-8" />
          <div className="space-y-3">
            <div className="skeleton-shimmer h-6 w-full rounded" />
            <div className="skeleton-shimmer h-6 w-full rounded" />
            <div className="skeleton-shimmer h-6 w-11/12 rounded" />
            <div className="skeleton-shimmer h-6 w-full rounded" />
            <div className="skeleton-shimmer h-6 w-10/12 rounded" />
          </div>
        </div>
      </div>
    );
  }

  // Not found / expired state - calm serif design
  if (state === "not-found") {
    return (
      <div className="min-h-screen bg-paper flex flex-col items-center justify-center px-6">
        <p className="font-serif text-xl text-ink italic text-center">
          This link has expired.
        </p>
        <p className="text-sm text-stone mt-2 text-center">
          Ask your teacher for a new link.
        </p>
      </div>
    );
  }

  // Mic denied state - calm serif design, no warning icon
  if (state === "mic-denied") {
    return (
      <div className="min-h-screen bg-paper flex flex-col items-center justify-center px-6">
        <p className="font-serif text-xl text-ink italic text-center max-w-md mb-4">
          We need your microphone to hear you read.
        </p>
        <div className="text-sm text-stone text-center max-w-md mb-6 space-y-2">
          <p>To enable your microphone:</p>
          <ol className="text-left list-decimal list-inside space-y-1 inline-block">
            <li>Click the lock icon in your browser&apos;s address bar</li>
            <li>Find &quot;Microphone&quot; and allow access</li>
            <li>Refresh this page</li>
          </ol>
        </div>
        <button
          onClick={handleRefreshPermission}
          className="text-sm text-accent-blue hover:underline"
        >
          Refresh page
        </button>
      </div>
    );
  }

  // Error state - calm serif design, no red icons
  if (state === "error") {
    return (
      <div className="min-h-screen bg-paper flex flex-col items-center justify-center px-6">
        <p className="font-serif text-xl text-ink italic text-center max-w-md mb-4">
          {errorMessage || "Something went wrong."}
        </p>
        <button
          onClick={handleRetry}
          className="text-sm text-accent-blue hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  // Offline state - calm serif design, no warning icon
  if (state === "offline") {
    return (
      <div className="min-h-screen bg-paper flex flex-col items-center justify-center px-6">
        <p className="font-serif text-xl text-ink italic text-center max-w-md mb-4">
          You&apos;re offline.
        </p>
        <p className="text-sm text-stone text-center max-w-md">
          Your recording is saved on this device. We&apos;ll upload it when you&apos;re back online.
        </p>
      </div>
    );
  }

  // Use currentPassage which handles both library and database passages
  const passage = currentPassage;

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      {/* Countdown overlay */}
      <AnimatePresence>
        {state === "countdown" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={countdownValue}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 1.5, opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="text-center"
              >
                <span className={`font-serif font-bold text-paper ${
                  countdownValue === "Go!" ? "text-[80px]" : "text-[120px]"
                }`}>
                  {countdownValue}
                </span>
                {countdownValue !== "Go!" && (
                  <p className="text-paper/60 text-lg mt-2">Get ready to read...</p>
                )}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Flow progress indicator */}
      <div className="pt-10 px-6">
        <div className="max-w-[680px] mx-auto">
          {/* Multi-passage progress indicator */}
          {totalPassages > 1 && (
            <div className="flex justify-center mb-4">
              <ProgressIndicator
                currentPassage={currentPassageIndex}
                totalPassages={totalPassages}
              />
            </div>
          )}

          <div className="flex items-center justify-center gap-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-success" />
              <span className="text-stone">Name</span>
            </div>
            <span className="text-mist">─</span>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent-blue" />
              <span className="text-ink font-medium">Reading</span>
            </div>
            <span className="text-mist">─</span>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-mist" />
              <span className="text-stone">Questions</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-24 pb-48">
        <div className="max-w-[680px] w-full">
          {passage && (
            <>
              <p className="text-sm text-stone lowercase tracking-wide mb-8">
                {passage.title.toLowerCase()}
              </p>
              <p className="font-serif text-2xl leading-relaxed text-ink">
                {passage.text}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Fixed bottom control area */}
      <div className="fixed bottom-0 left-0 right-0 bg-paper border-t border-mist">
        <AnimatePresence mode="wait">
          {state === "checking-mic" && (
            <motion.div
              key="checking"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center py-6 px-6"
            >
              {/* Microphone icon with pulse */}
              <div className="w-16 h-16 rounded-full bg-accent-blue/10 flex items-center justify-center mb-4 animate-pulse">
                <svg className="w-7 h-7 text-accent-blue" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z" />
                </svg>
              </div>
              <p className="text-base text-ink font-medium">
                Connecting microphone...
              </p>
              <p className="text-sm text-stone text-center mt-1">
                Please click &quot;Allow&quot; if your browser asks for permission
              </p>
            </motion.div>
          )}

          {state === "ready" && (
            <motion.div
              key="ready"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center py-6 px-6"
            >
              {/* Mic ready indicator */}
              <div className="flex items-center gap-1.5 text-xs text-success mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-success" />
                Microphone ready
              </div>
              <button
                onClick={handleStartRecording}
                className="w-16 h-16 rounded-full bg-accent-blue cursor-pointer focus:outline-none focus:ring-4 focus:ring-accent-blue/30 transition-transform active:scale-95 flex items-center justify-center"
                aria-label="Start recording"
              >
                <svg
                  className="w-7 h-7 text-paper"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z" />
                </svg>
              </button>
              <p className="mt-4 text-base text-ink font-medium">
                Start recording
              </p>
              <p className="text-sm text-stone">Read the passage aloud</p>
            </motion.div>
          )}

          {state === "initializing" && (
            <motion.div
              key="initializing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center py-6 px-6"
            >
              <div className="w-16 h-16 rounded-full bg-accent-blue/20 flex items-center justify-center mb-4">
                <motion.div
                  className="w-8 h-8 rounded-full border-2 border-accent-blue border-t-transparent"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                />
              </div>
              <p className="text-base text-ink font-medium">
                Getting ready...
              </p>
              <p className="text-sm text-stone">Preparing your microphone</p>
            </motion.div>
          )}

          {state === "recording" && (
            <motion.div
              key="recording"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center py-6 px-6"
            >
              {/* Timer and audio level */}
              <div className="flex items-center gap-3 mb-4">
                <p className="text-sm text-stone font-mono">
                  {formatTime(elapsedTime)}
                </p>
                {/* Audio level indicator */}
                <div className="flex items-center gap-0.5 h-4">
                  {[0.1, 0.2, 0.35, 0.5, 0.7].map((threshold, i) => (
                    <div
                      key={i}
                      className={`w-1 rounded-full transition-all ${
                        audioLevel > threshold
                          ? "bg-success"
                          : "bg-mist"
                      }`}
                      style={{ height: `${8 + i * 3}px` }}
                    />
                  ))}
                </div>
              </div>

              {/* Stop button with breathing dot effect */}
              <button
                onClick={handleStop}
                className="relative w-16 h-16 rounded-full bg-accent-blue cursor-pointer focus:outline-none focus:ring-4 focus:ring-accent-blue/30 transition-transform active:scale-95"
                aria-label="Stop recording"
              >
                {/* Breathing pulse ring */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <BreathingDot
                    size={64}
                    color="bg-transparent"
                    className="border-2 border-accent-blue/50 absolute"
                  />
                </div>
                {/* Stop square */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-5 h-5 bg-paper rounded-sm" />
                </div>
              </button>

              <p className="mt-4 text-base text-ink font-medium">
                Tap when finished
              </p>
            </motion.div>
          )}

          {state === "uploading" && (
            <motion.div
              key="uploading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center py-6 px-6"
            >
              {/* Pulsing indicator instead of spinner */}
              <div className="w-16 h-16 rounded-full bg-accent-blue/10 flex items-center justify-center mb-4 animate-pulse">
                <div className="w-3 h-3 rounded-full bg-accent-blue" />
              </div>
              <p className="text-base text-ink font-medium">
                {uploadProgress?.message || "Analyzing..."}
              </p>
              {uploadProgress && uploadProgress.status === "retrying" && (
                <p className="text-sm text-stone mt-1">
                  Attempt {uploadProgress.attempt} of {uploadProgress.maxAttempts}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function RecordingPage({ params }: RecordingPageProps) {
  const { token } = use(params);

  return (
    <Suspense fallback={<div className="min-h-screen bg-paper" />}>
      <RecordingContent token={token} />
    </Suspense>
  );
}
