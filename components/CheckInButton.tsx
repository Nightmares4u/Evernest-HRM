"use client";

// Client-side check-in trigger.
// Tries to capture browser geolocation (silently — declined or unavailable
// just means we proceed without it), then invokes the server action with the
// coords as form data. The server is the source of truth for IP / time;
// geolocation is supplementary.

import { useState, useTransition } from "react";
import { checkIn } from "@/app/(dashboard)/attendance/actions";

async function getCoords(): Promise<{
  lat: number;
  lng: number;
  accuracy: number;
} | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 8000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 }
    );
  });
}

export function CheckInButton() {
  const [isPending, startTransition] = useTransition();
  const [stage, setStage] = useState<"idle" | "locating" | "submitting">("idle");

  function onClick() {
    startTransition(async () => {
      setStage("locating");
      const coords = await getCoords();
      const fd = new FormData();
      if (coords) {
        fd.set("lat", String(coords.lat));
        fd.set("lng", String(coords.lng));
        fd.set("accuracy", String(coords.accuracy));
      }
      setStage("submitting");
      await checkIn(fd);
      setStage("idle");
    });
  }

  const label =
    stage === "locating"
      ? "Capturing location…"
      : stage === "submitting"
        ? "Checking in…"
        : "Check in now";

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
      >
        {label}
      </button>
      <p className="text-[11px] text-gray-500">
        Your browser may ask to share location. It&apos;s optional — declining
        still lets you check in. Office IP is matched server-side regardless.
      </p>
    </div>
  );
}
