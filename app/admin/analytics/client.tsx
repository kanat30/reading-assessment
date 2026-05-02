"use client";

import { useState } from "react";
import Link from "next/link";
import { AnalyticsReport, CalibrationRecommendation } from "@/lib/analytics/types";

interface Teacher {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

interface AnalyticsClientProps {
  report: AnalyticsReport;
  currentUser: Teacher;
}

export function AnalyticsClient({ report }: AnalyticsClientProps) {
  const { analytics, recommendations } = report;
  const [copied, setCopied] = useState(false);

  const hasData = analytics.wcpm.total_overrides > 0 || analytics.prosody.total_overrides > 0;

  // Generate export text
  const generateExportText = () => {
    const lines: string[] = [
      "# AI Calibration Report",
      `Generated: ${new Date(report.generated_at).toLocaleString()}`,
      `Period: ${new Date(analytics.period.start).toLocaleDateString()} - ${new Date(analytics.period.end).toLocaleDateString()}`,
      "",
      "## Summary",
      `- Total sessions: ${analytics.total_sessions}`,
      `- Sessions corrected: ${analytics.sessions_with_overrides} (${analytics.override_rate.toFixed(1)}%)`,
      `- WCPM overrides: ${analytics.wcpm.total_overrides}`,
      `- Prosody overrides: ${analytics.prosody.total_overrides}`,
      "",
    ];

    if (analytics.wcpm.total_overrides > 0) {
      lines.push(
        "## WCPM Analysis",
        `- Average adjustment: ${analytics.wcpm.avg_adjustment > 0 ? "+" : ""}${analytics.wcpm.avg_adjustment}`,
        `- Adjustments up: ${analytics.wcpm.adjustments_up}`,
        `- Adjustments down: ${analytics.wcpm.adjustments_down}`,
        `- Avg original: ${analytics.wcpm.avg_original} → Avg corrected: ${analytics.wcpm.avg_corrected}`,
        ""
      );
    }

    if (recommendations.length > 0) {
      lines.push("## Recommendations");
      recommendations.forEach((rec, i) => {
        lines.push(
          `${i + 1}. [${rec.priority.toUpperCase()}] ${rec.title}`,
          `   ${rec.description}`,
          rec.current_value && rec.suggested_value
            ? `   Current: ${rec.current_value} → Suggested: ${rec.suggested_value}`
            : "",
          ""
        );
      });

      lines.push(
        "## How to Apply",
        "1. Open lib/scoring/alignment.ts",
        "2. Find MISPRONUNCIATION_THRESHOLD (currently 0.80)",
        "3. Update to the suggested value",
        "4. Deploy changes",
        ""
      );
    }

    return lines.filter(l => l !== undefined).join("\n");
  };

  const handleCopy = async () => {
    const text = generateExportText();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <header className="bg-paper border-b border-mist">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-ink">AI Calibration</h1>
            <p className="text-xs text-stone">
              {new Date(analytics.period.start).toLocaleDateString()} – {new Date(analytics.period.end).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={handleCopy}
              className="text-sm text-accent-blue hover:underline"
            >
              {copied ? "Copied!" : "Copy Report"}
            </button>
            <Link href="/admin" className="text-sm text-stone hover:text-ink">
              ← Back
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-4">
          <StatCard label="Sessions" value={analytics.total_sessions} />
          <StatCard
            label="Corrected"
            value={analytics.sessions_with_overrides}
            sub={`${analytics.override_rate.toFixed(1)}%`}
          />
          <StatCard
            label="WCPM"
            value={analytics.wcpm.total_overrides}
            sub={analytics.wcpm.total_overrides > 0 ? `${analytics.wcpm.avg_adjustment > 0 ? "+" : ""}${analytics.wcpm.avg_adjustment} avg` : undefined}
            trend={analytics.wcpm.avg_adjustment > 0 ? "up" : analytics.wcpm.avg_adjustment < 0 ? "down" : undefined}
          />
          <StatCard label="Prosody" value={analytics.prosody.total_overrides} />
        </div>

        {/* Recommendations */}
        {recommendations.length > 0 ? (
          <div className="bg-paper rounded-lg border border-mist">
            <div className="px-4 py-2.5 border-b border-mist bg-mist/20 flex items-center justify-between">
              <span className="text-xs font-medium text-stone uppercase tracking-wide">Recommendations</span>
              <span className="text-xs text-stone">{recommendations.length} found</span>
            </div>
            <div className="divide-y divide-mist/50">
              {recommendations.map((rec) => (
                <RecommendationRow key={rec.id} rec={rec} />
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-paper rounded-lg border border-mist p-6 text-center">
            <p className="text-stone text-sm">
              {hasData
                ? "No strong patterns detected yet. Need more override data."
                : "No teacher corrections recorded. Encourage teachers to use the \"Disagree with this score?\" feature."}
            </p>
          </div>
        )}

        {/* Details (collapsed by default when no data) */}
        {hasData && (
          <div className="grid grid-cols-2 gap-4">
            {/* WCPM Details */}
            <div className="bg-paper rounded-lg border border-mist">
              <div className="px-4 py-2.5 border-b border-mist bg-mist/20">
                <span className="text-xs font-medium text-stone uppercase tracking-wide">WCPM Details</span>
              </div>
              <div className="p-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-stone">Direction</p>
                  <p className="font-medium">
                    <span className="text-success">↑{analytics.wcpm.adjustments_up}</span>
                    {" / "}
                    <span className="text-alert">↓{analytics.wcpm.adjustments_down}</span>
                  </p>
                </div>
                <div>
                  <p className="text-xs text-stone">Average Change</p>
                  <p className="font-medium text-ink">
                    {analytics.wcpm.avg_original} → {analytics.wcpm.avg_corrected}
                  </p>
                </div>
              </div>
            </div>

            {/* Prosody Details */}
            <div className="bg-paper rounded-lg border border-mist">
              <div className="px-4 py-2.5 border-b border-mist bg-mist/20">
                <span className="text-xs font-medium text-stone uppercase tracking-wide">Prosody Details</span>
              </div>
              <div className="p-4 flex flex-wrap gap-2">
                {Object.entries(analytics.prosody.by_dimension).map(([dim, stats]) => (
                  <div
                    key={dim}
                    className={`px-2 py-1 rounded text-xs ${
                      stats.count > 0 ? "bg-mist/50 text-ink" : "bg-mist/20 text-stone"
                    }`}
                  >
                    {dim}: {stats.count}
                    {stats.count > 0 && stats.avg_adjustment !== 0 && (
                      <span className={stats.avg_adjustment > 0 ? "text-success" : "text-alert"}>
                        {" "}({stats.avg_adjustment > 0 ? "+" : ""}{stats.avg_adjustment})
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* How to Apply Section */}
        {recommendations.some(r => r.suggested_value) && (
          <div className="bg-accent-blue/5 border border-accent-blue/20 rounded-lg p-4">
            <h3 className="text-sm font-medium text-ink mb-2">How to Apply Changes</h3>
            <ol className="text-sm text-stone space-y-1 list-decimal list-inside">
              <li>Open <code className="bg-mist px-1 rounded text-xs">lib/scoring/alignment.ts</code></li>
              <li>Find <code className="bg-mist px-1 rounded text-xs">MISPRONUNCIATION_THRESHOLD</code> (line ~10)</li>
              <li>Update the value based on recommendations above</li>
              <li>Deploy and monitor override rate over next 2-4 weeks</li>
            </ol>
          </div>
        )}

        {/* Footer */}
        <p className="text-xs text-stone text-center pt-4">
          All data stays on your server. No student information is sent externally.
        </p>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  trend,
}: {
  label: string;
  value: number;
  sub?: string;
  trend?: "up" | "down";
}) {
  return (
    <div className="bg-paper rounded-lg border border-mist p-3">
      <p className="text-xs text-stone uppercase tracking-wide">{label}</p>
      <p className="text-xl font-semibold text-ink">{value}</p>
      {sub && (
        <p className={`text-xs ${trend === "up" ? "text-success" : trend === "down" ? "text-alert" : "text-stone"}`}>
          {sub}
        </p>
      )}
    </div>
  );
}

function RecommendationRow({ rec }: { rec: CalibrationRecommendation }) {
  const priorityStyles = {
    high: "bg-alert/10 text-alert border-alert/20",
    medium: "bg-warning/10 text-warning border-warning/20",
    low: "bg-mist text-stone border-mist",
  };

  return (
    <div className="px-4 py-3 flex items-start gap-3">
      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${priorityStyles[rec.priority]}`}>
        {rec.priority.toUpperCase()}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink">{rec.title}</p>
        <p className="text-xs text-stone mt-0.5">{rec.description}</p>
        {rec.current_value && rec.suggested_value && (
          <p className="text-xs mt-1">
            <code className="bg-mist px-1 rounded">{rec.current_value}</code>
            <span className="mx-1.5 text-stone">→</span>
            <code className="bg-success/20 text-success px-1 rounded">{rec.suggested_value}</code>
          </p>
        )}
      </div>
      <span className="text-xs text-stone" title="Confidence">
        {Math.round(rec.confidence * 100)}%
      </span>
    </div>
  );
}
