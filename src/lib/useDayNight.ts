// src/lib/useDayNight.ts
import { useState, useEffect } from "react";
import * as THREE from "three";

// Real-time day/night cycle synced across all clients using server time
// Full cycle = 24 real minutes (1440 seconds) → 1 real second = 1 game minute
const CYCLE_DURATION_SECONDS = 1440; // 24 minutes real time = 1 full game day
const DAY_START_HOUR = 6;            // Game time starts at 6 AM
const NIGHT_START_HOUR = 20;         // Night begins at 8 PM

export function useDayNight() {
  const [timeOfDay, setTimeOfDay] = useState(0); // 0 to 1 (fraction of day)

  useEffect(() => {
    const updateTime = () => {
      const now = Date.now() / 1000; // current unix seconds
      const cycleProgress = (now % CYCLE_DURATION_SECONDS) / CYCLE_DURATION_SECONDS;
      setTimeOfDay(cycleProgress);
    };

    updateTime(); // immediate first call
    const interval = setInterval(updateTime, 1000); // update every real second

    return () => clearInterval(interval);
  }, []);

  // Convert fraction to game hour (0-24)
  const gameHour = (DAY_START_HOUR + timeOfDay * 24) % 24;

  // Sun elevation (-90° = midnight, +90° = noon)
  const sunElevation = Math.sin(timeOfDay * Math.PI * 2) * 90;

  // Rough day/night detection
  const isDay = sunElevation > -10;

  return {
    timeOfDay,      // 0–1 full cycle progress
    gameHour,       // 0–24 game hour
    sunElevation,   // degrees for positioning sun/moon
    isDay,
  };
}

// Helper: Get sky color based on time (used for fallback/background)
export function getSkyColor(timeOfDay: number): THREE.Color {
  const t = timeOfDay * 24; // game hour
  if (t >= 6 && t < 18) {
    // Day: deep blue
    return new THREE.Color(0.2, 0.5, 1.0);
  } else if (t >= 18 && t < 20) {
    // Sunset: orange-purple transition
    const mix = (t - 18) / 2;
    return new THREE.Color(1, 0.5 - mix * 0.5, 0.8 - mix * 0.8).lerp(
      new THREE.Color(0.4, 0.2, 0.6),
      mix
    );
  } else {
    // Night: dark blue-black
    return new THREE.Color(0.05, 0.08, 0.15);
  }
}