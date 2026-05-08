"use client";

// Client-side check-in trigger.
// Captures the browser's geolocation (or its denial reason) before invoking
// the server action with the coords + a status string. The server is the
// source of truth for IP / time. Geolocation is supplementary, but we surface
// the result clearly so the user knows it was processed and the server can
// flag check-ins that lack location proof.

import { useState, useTransition } from "react";
import { checkIn } from "@/app/(dashboard)/attendance/actions";

type GeoStatus =
  | "granted"
  | "denied"
  | "unavailable"
  | "timeout"
  | "not_supported";

type GeoResult =
  | {
      status: "granted";
      coords: { lat: number; lng: number; accuracy: number };
    }
  | { status: Exclude<GeoStatus, "granted"> };

async function getCoords(): Promise<GeoResult> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return { status: "not_supported" };
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ status: "timeout" }), 8000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve({
          status: "granted",
          coords: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          },
        });
      },
      (err) => {
        clearTimeout(timer);
        if (err.code === 1) resolve({ status: "denied" });
        else if (err.code === 2) resolve({ status: "unavailable" });
        else if (err.code === 3) resolve({ status: "timeout" });
        else resolve({ status: "unavailable" });
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 }
    );
  });
}

const STATUS_COPY: Record<
  GeoStatus,
  { label: string; tone: "green" | "amber" | "gray" }
> = {
  granted: { label: "Location captured ✓", tone: "green" },
  denied: {
    label:
      "Location denied (macOS Location Services off, or browser permission blocked) — check-in will be flagged for review.",
    tone: "amber",
  },
  unavailable: {
    label: "Location unavailable — check-in will be flagged.",
    tone: "amber",
  },
  timeout: {
    label: "Location timed out — check-in will be flagged.",
    tone: "amber",
  },
  not_supported: {
    label: "Browser doesn't support location — check-in will be flagged.",
    tone: "gray",
  },
};

export function CheckInButton() {
  const [isPending, startTransition] = useTransition();
  const [stage, setStage] = useState<"idle" | "locating" | "submitting">(
    "idle"
  );
  const [geoStatus, setGeoStatus] = useState<GeoStatus | null>(null);

  function onClick() {
    startTransition(async () => {
      setStage("locating");
      setGeoStatus(null);

      const result = await getCoords();
      setGeoStatus(result.status);

      // Brief moment so the user actually sees the status (~600ms).
      if (result.status !== "granted") {
        await new Promise((r) => setTimeout(r, 600));
      }

      setStage("submitting");
      const fd = new FormData();
      if (result.status === "granted") {
        fd.set("lat", String(result.coords.lat));
        fd.set("lng", String(result.coords.lng));
        fd.set("accuracy", String(result.coords.accuracy));
      }
      fd.set("geolocation_status", result.status);
      await checkIn(fd);
      // server action redirects on success; reaching here means we stayed on /dashboard
      setStage("idle");
    });
  }

  const buttonLabel =
    stage === "locating"
      ? "Requesting location…"
      : stage === "submitting"
        ? "Checking in…"
        : "Check in now";

  return (
    <div className="space-y-2">
      {geoStatus && (
        <div
          className={`rounded-md border px-3 py-2 text-xs ${
            STATUS_COPY[geoStatus].tone === "green"
              ? "border-green-200 bg-green-50 text-green-800"
              : STATUS_COPY[geoStatus].tone === "amber"
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-gray-200 bg-gray-50 text-gray-700"
          }`}
        >
          {STATUS_COPY[geoStatus].label}
        </div>
      )}
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
      >
        {buttonLabel}
      </button>
      <p className="text-[11px] text-gray-500">
        Office IP is matched server-side regardless. Geolocation is recorded
        when granted; denied/unavailable check-ins are flagged for super-admin
        review.
      </p>
    </div>
  );
}
