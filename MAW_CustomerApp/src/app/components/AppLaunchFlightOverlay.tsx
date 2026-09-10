import React, { useLayoutEffect, useState } from 'react';
import { brandLogoSrc } from './BrandLogoBadge';
import { getHasPlayedLaunchAnimation, setHasPlayedLaunchAnimation } from '../lib/launchState';

export type LaunchLogoFlight = {
  left: number;
  top: number;
  width: number;
  height: number;
  translateX: number;
  translateY: number;
  scale: number;
};

export function AppLaunchFlightOverlay({
  targetRef,
  targetSelector = '[data-header-logo="true"]',
  onDone,
  delayMoveMs = 260,
  durationMs = 820,
}: {
  targetRef?: React.RefObject<HTMLElement | null>;
  targetSelector?: string;
  onDone?: () => void;
  delayMoveMs?: number;
  durationMs?: number;
}) {
  const [shouldPlay] = useState(() => !getHasPlayedLaunchAnimation());
  const [phase, setPhase] = useState<'preparing' | 'moving' | 'fading' | 'done'>(() => (shouldPlay ? 'preparing' : 'done'));
  const [flight, setFlight] = useState<LaunchLogoFlight | null>(null);

  useLayoutEffect(() => {
    if (!shouldPlay) {
      document.documentElement.removeAttribute('data-launch-active');
      return;
    }
    document.documentElement.setAttribute('data-launch-active', 'true');

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.documentElement.removeAttribute('data-launch-active');
      setHasPlayedLaunchAnimation(true);
      setPhase('done');
      onDone?.();
      return;
    }

    let moveTimer = 0;
    let fadeTimer = 0;
    let finishTimer = 0;
    let measureTimer = 0;
    let retryCount = 0;
    let cancelled = false;

    const measureAndStart = () => {
      if (cancelled) return;
      const el = targetRef?.current || (targetSelector ? document.querySelector(targetSelector) : null);
      const targetImg = el instanceof HTMLImageElement ? el : el?.querySelector('img') || el;
      if (!targetImg) {
        retryCount++;
        if (retryCount > 10) {
          // If no target header logo exists (e.g. refreshed on a subpage), exit immediately
          document.documentElement.removeAttribute('data-launch-active');
          setHasPlayedLaunchAnimation(true);
          setPhase('done');
          onDone?.();
          return;
        }
        measureTimer = window.setTimeout(measureAndStart, 25);
        return;
      }
      const target = targetImg.getBoundingClientRect();
      if (!target || target.width < 20 || target.height < 10) {
        retryCount++;
        if (retryCount > 10) {
          document.documentElement.removeAttribute('data-launch-active');
          setHasPlayedLaunchAnimation(true);
          setPhase('done');
          onDone?.();
          return;
        }
        measureTimer = window.setTimeout(measureAndStart, 25);
        return;
      }
      const targetCenterX = target.left + target.width / 2;
      const targetCenterY = target.top + target.height / 2;
      const launchWidth = Math.min(window.innerWidth * 0.82, 340);
      const scale = launchWidth / target.width;
      if (cancelled) return;
      setFlight({
        left: target.left,
        top: target.top,
        width: target.width,
        height: target.height,
        translateX: window.innerWidth / 2 - targetCenterX,
        translateY: window.innerHeight / 2 - targetCenterY,
        scale,
      });

      // 1. Start moving
      moveTimer = window.setTimeout(() => setPhase('moving'), delayMoveMs);

      // 2. Touchdown: reveal static logo immediately & fade overlay smoothly
      fadeTimer = window.setTimeout(() => {
        document.documentElement.removeAttribute('data-launch-active');
        setPhase('fading');
      }, delayMoveMs + durationMs);

      // 3. Finish & unmount
      finishTimer = window.setTimeout(() => {
        setHasPlayedLaunchAnimation(true);
        setPhase('done');
        onDone?.();
      }, delayMoveMs + durationMs + 200);
    };

    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(measureAndStart);
    });

    return () => {
      cancelled = true;
      document.documentElement.removeAttribute('data-launch-active');
      window.cancelAnimationFrame(frame);
      window.clearTimeout(measureTimer);
      window.clearTimeout(moveTimer);
      window.clearTimeout(fadeTimer);
      window.clearTimeout(finishTimer);
    };
  }, [shouldPlay, targetRef, targetSelector, delayMoveMs, durationMs, onDone]);

  if (!shouldPlay || phase === 'done') return null;

  const initialWidth = Math.min(typeof window !== 'undefined' ? window.innerWidth * 0.82 : 320, 340);

  return (
    <div
      className={`maw-launch-screen fixed inset-0 z-[100] ${
        phase === 'moving' || phase === 'fading' ? 'maw-launch-screen-moving' : ''
      } ${phase === 'fading' ? 'maw-launch-screen-fading' : ''}`}
      aria-label="Mewah AutoWorks"
      aria-live="polite"
    >
      {flight ? (
        <img
          src={brandLogoSrc}
          alt="Mewah AutoWorks"
          className="maw-launch-logo fixed block object-contain"
          data-moving={phase === 'moving' || phase === 'fading' ? 'true' : 'false'}
          style={{
            left: `${flight.left}px`,
            top: `${flight.top}px`,
            width: `${flight.width}px`,
            height: `${flight.height}px`,
            '--maw-launch-x': `${flight.translateX}px`,
            '--maw-launch-y': `${flight.translateY}px`,
            '--maw-launch-scale': flight.scale,
          } as React.CSSProperties}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center px-6">
          <img
            src={brandLogoSrc}
            alt="Mewah AutoWorks"
            className="block h-auto object-contain"
            style={{ width: initialWidth }}
          />
        </div>
      )}
    </div>
  );
}
