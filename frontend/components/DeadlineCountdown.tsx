"use client";

import React, { useState, useEffect } from "react";
import { Clock, AlertTriangle, CheckCircle, Ban, Hourglass } from "lucide-react";

interface DeadlineCountdownProps {
  dueDate: string;
  startDate?: string | null;
  allowLateSubmissions?: boolean;
  lateDeadline?: string | null;
  isSubmitted?: boolean;
  isLate?: boolean;
  compact?: boolean;
}

export function DeadlineCountdown({
  dueDate,
  startDate,
  allowLateSubmissions = false,
  lateDeadline,
  isSubmitted = false,
  isLate = false,
  compact = false,
}: DeadlineCountdownProps) {
  const [timeLeft, setTimeLeft] = useState<{
    status: "upcoming" | "active" | "urgent" | "warning" | "closed" | "late_open" | "submitted";
    displayText: string;
    subText?: string;
  }>({
    status: isSubmitted ? "submitted" : "active",
    displayText: "Calculating...",
  });

  useEffect(() => {
    if (isSubmitted) {
      setTimeLeft({
        status: "submitted",
        displayText: isLate ? "Submitted Late" : "Submitted On-Time",
      });
      return;
    }

    function calculate() {
      const now = new Date().getTime();
      const dueTime = new Date(dueDate).getTime();
      const startTime = startDate ? new Date(startDate).getTime() : 0;
      const lateTime = lateDeadline ? new Date(lateDeadline).getTime() : 0;

      // Check if assignment has not started yet
      if (startTime && now < startTime) {
        const diff = startTime - now;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        return {
          status: "upcoming" as const,
          displayText: `Starts In < ${days}d ${hours}h ${minutes}m >`,
          subText: `Opens ${new Date(startDate!).toLocaleString()}`,
        };
      }

      // Check if past due date
      if (now > dueTime) {
        if (allowLateSubmissions) {
          // If there's an explicit late deadline and it passed
          if (lateTime && now > lateTime) {
            return {
              status: "closed" as const,
              displayText: "Deadline Closed",
              subText: "Late submission window ended",
            };
          }
          const diff = lateTime ? lateTime - now : 0;
          if (lateTime && diff > 0) {
            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            return {
              status: "late_open" as const,
              displayText: `Late Window < ${hours}h ${minutes}m left >`,
              subText: "Late penalty may apply",
            };
          }
          return {
            status: "late_open" as const,
            displayText: "Late Submissions Allowed",
            subText: "Marks penalty may apply",
          };
        } else {
          return {
            status: "closed" as const,
            displayText: "Deadline Closed",
            subText: "Submissions no longer accepted",
          };
        }
      }

      // Active assignment before due date
      const diff = dueTime - now;
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      const pad = (n: number) => String(n).padStart(2, "0");

      if (diff < 1000 * 60 * 60) {
        // Less than 1 hour -> Urgent Pulsing Red
        return {
          status: "urgent" as const,
          displayText: `< 00h ${pad(minutes)}m ${pad(seconds)}s >`,
          subText: "Urgent: Closing shortly!",
        };
      } else if (diff < 1000 * 60 * 60 * 24) {
        // Less than 24 hours -> Warning Amber
        return {
          status: "warning" as const,
          displayText: `< ${hours}h ${minutes}m ${pad(seconds)}s >`,
          subText: "Due today!",
        };
      } else {
        // More than 24 hours -> Standard Green / Slate
        return {
          status: "active" as const,
          displayText: `< ${days} Days ${pad(hours)} Hours ${pad(minutes)} Mins >`,
          subText: `Due ${new Date(dueDate).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`,
        };
      }
    }

    setTimeLeft(calculate());
    const interval = setInterval(() => {
      setTimeLeft(calculate());
    }, 1000);

    return () => clearInterval(interval);
  }, [dueDate, startDate, allowLateSubmissions, lateDeadline, isSubmitted, isLate]);

  const badgeStyles = {
    submitted: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    active: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
    warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 animate-pulse",
    urgent: "bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/50 animate-bounce",
    closed: "bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/20",
    late_open: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30",
    upcoming: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30",
  }[timeLeft.status];

  const Icon = {
    submitted: CheckCircle,
    active: Clock,
    warning: AlertTriangle,
    urgent: AlertTriangle,
    closed: Ban,
    late_open: Hourglass,
    upcoming: Clock,
  }[timeLeft.status];

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium border ${badgeStyles}`}
        title={timeLeft.subText}
      >
        <Icon className="w-3.5 h-3.5" />
        {timeLeft.displayText}
      </span>
    );
  }

  return (
    <div className={`flex flex-col gap-0.5 px-3 py-2 rounded-xl border ${badgeStyles} transition-all`}>
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 flex-shrink-0" />
        <span className="font-mono text-sm font-semibold tracking-tight">{timeLeft.displayText}</span>
      </div>
      {timeLeft.subText && (
        <span className="text-[11px] opacity-80 pl-6 font-sans">{timeLeft.subText}</span>
      )}
    </div>
  );
}
