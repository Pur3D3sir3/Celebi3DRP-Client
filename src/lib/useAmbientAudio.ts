// src/lib/useAmbientAudio.ts
import { useEffect, useRef } from "react";
import { Howl } from "howler";
import { useDayNight } from "./useDayNight"; // your existing day/night hook

// Paths — adjust if your files are in public/assets/audio/
const DAY_SOUND = "/audio/day.mp3";      // birds, nature
const NIGHT_SOUND = "/audio/night.mp3";  // crickets, owls
const INDOOR_SOUND = "/audio/inside.mp3"; // RPG ambient loop

export function useAmbientAudio({
  hasSky,           // from your Scene: true = outdoor (day/night), false = indoor
}: {
  hasSky: boolean;
}) {
  const { isDay } = useDayNight();

  const dayRef = useRef<Howl | null>(null);
  const nightRef = useRef<Howl | null>(null);
  const indoorRef = useRef<Howl | null>(null);

  // Initialize sounds once
  useEffect(() => {
    dayRef.current = new Howl({
      src: [DAY_SOUND],
      loop: true,
      volume: 0.4,
      preload: true,
    });

    nightRef.current = new Howl({
      src: [NIGHT_SOUND],
      loop: true,
      volume: 0.4,
      preload: true,
    });

    indoorRef.current = new Howl({
      src: [INDOOR_SOUND],
      loop: true,
      volume: 0.6,
      preload: true,
    });

    return () => {
      dayRef.current?.unload();
      nightRef.current?.unload();
      indoorRef.current?.unload();
    };
  }, []);

  // Crossfade logic when scene or time changes
  useEffect(() => {
    if (!hasSky) {
      // Indoor scene → play indoor music, stop outdoor sounds
      dayRef.current?.fade(dayRef.current.volume(), 0, 2000);
      nightRef.current?.fade(nightRef.current.volume(), 0, 2000);

      setTimeout(() => {
        dayRef.current?.stop();
        nightRef.current?.stop();
        indoorRef.current?.play();
        indoorRef.current?.fade(0, 0.6, 2000); // fade in
      }, 2000);
    } else {
      // Outdoor scene → play day/night based on time, stop indoor
      indoorRef.current?.fade(indoorRef.current.volume(), 0, 2000);

      setTimeout(() => {
        indoorRef.current?.stop();

        if (isDay) {
          nightRef.current?.fade(nightRef.current.volume(), 0, 2000);
          dayRef.current?.play();
          dayRef.current?.fade(0, 0.4, 2000);
        } else {
          dayRef.current?.fade(dayRef.current.volume(), 0, 2000);
          nightRef.current?.play();
          nightRef.current?.fade(0, 0.4, 2000);
        }
      }, 2000);
    }
  }, [hasSky, isDay]); // Re-run when scene type or day/night changes

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      dayRef.current?.stop();
      nightRef.current?.stop();
      indoorRef.current?.stop();
    };
  }, []);

  return null; // This is a side-effect hook — returns nothing
}