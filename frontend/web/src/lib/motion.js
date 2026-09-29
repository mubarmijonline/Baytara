// Motion helpers for the homepage.
//
// Two rules the whole file is built around, because this is a veterinary school and not
// a showreel: animate nothing but transform and opacity, so every frame stays on the
// compositor and off the main thread; and hand anyone who asks for reduced motion the
// finished state immediately rather than a slower version of the same movement.
//
// No animation library. Everything here is IntersectionObserver plus CSS transitions,
// which costs the bundle nothing and cannot drop frames on a mid-range phone.
import { useEffect, useRef, useState } from 'react';

export function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;   // no matchMedia (jsdom, very old browser): animate, it is harmless
  }
}

/**
 * Reveal an element once it has scrolled into view.
 *
 * Returns a ref to attach. The element should carry the `reveal` class; this adds
 * `is-in` when it arrives, and the CSS does the rest. Observing stops on the first
 * intersection, so a long page never keeps dozens of observers alive.
 */
export function useReveal({ rootMargin = '0px 0px -12% 0px', threshold = 0.15 } = {}) {
  const ref = useRef(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    // Reduced motion, or a browser without the observer: show it and stop.
    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      node.classList.add('is-in');
      return undefined;
    }
    // Already on screen at mount (above the fold): reveal without waiting for a scroll
    // that may never come.
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        observer.unobserve(entry.target);
      });
    }, { rootMargin, threshold });
    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin, threshold]);

  return ref;
}

// A stat reads "2+ مليون" or "4.8" or "1,200". Only the number moves; everything the
// client wrote around it is kept exactly as written.
const NUMBER = /-?\d[\d,]*(?:\.\d+)?/;

export function splitStat(text) {
  const match = String(text ?? '').match(NUMBER);
  if (!match) return null;
  const raw = match[0];
  const value = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;
  const decimals = raw.includes('.') ? raw.split('.')[1].length : 0;
  return {
    prefix: String(text).slice(0, match.index),
    suffix: String(text).slice(match.index + raw.length),
    value,
    decimals,
    grouped: raw.includes(','),
    width: raw.length,
  };
}

function format(value, { decimals, grouped }) {
  const fixed = value.toFixed(decimals);
  if (!grouped) return fixed;
  const [whole, fraction] = fixed.split('.');
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction ? `${withCommas}.${fraction}` : withCommas;
}

/**
 * Count a number up once, when it scrolls into view.
 *
 * Returns [ref, text]. `text` is the finished value until the element is seen, so a
 * viewer who never scrolls there -- or who asked for reduced motion, or whose browser
 * has no observer -- reads the real figure rather than a zero.
 */
export function useCountUp(target, { duration = 1100 } = {}) {
  const parts = splitStat(target);
  const [value, setValue] = useState(() => (parts ? parts.value : null));
  const ref = useRef(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || !parts) return undefined;
    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') return undefined;

    let frame = 0;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      const start = performance.now();
      const step = (now) => {
        const progress = Math.min(1, (now - start) / duration);
        // ease-out cubic: quick to most of the way, settles rather than stops dead
        const eased = 1 - (1 - progress) ** 3;
        setValue(parts.value * eased);
        if (progress < 1) frame = requestAnimationFrame(step);
        else setValue(parts.value);
      };
      setValue(0);
      frame = requestAnimationFrame(step);
    }, { threshold: 0.4 });

    observer.observe(node);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  if (!parts) return [ref, String(target ?? '')];
  return [ref, `${parts.prefix}${format(value ?? parts.value, parts)}${parts.suffix}`, parts.width];
}

/** Whether the page has scrolled past roughly one screen -- the back-to-top trigger. */
export function useScrolledPastFold() {
  const [past, setPast] = useState(false);
  useEffect(() => {
    // passive, and it only ever flips a boolean, so scrolling stays off the main thread's
    // critical path.
    const onScroll = () => setPast(window.scrollY > window.innerHeight * 0.9);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return past;
}
