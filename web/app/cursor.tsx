'use client';
import { useEffect, useRef } from 'react';

export default function CursorTracker() {
  const ringRef = useRef<HTMLDivElement>(null);
  const dotRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Only on pointer:fine devices
    if (window.matchMedia('(pointer: coarse)').matches) return;

    const ring = ringRef.current;
    const dot  = dotRef.current;
    if (!ring || !dot) return;

    let raf = 0;
    let mx = -100, my = -100;

    const onMove = (e: MouseEvent) => {
      mx = e.clientX;
      my = e.clientY;
      // dot follows instantly
      dot.style.left = mx + 'px';
      dot.style.top  = my + 'px';
      dot.classList.remove('cursor-hidden');
      ring.classList.remove('cursor-hidden');
    };

    const loop = () => {
      // ring follows with a slight lag via lerp
      const rx = parseFloat(ring.style.left  || '0');
      const ry = parseFloat(ring.style.top   || '0');
      const nx = rx + (mx - rx) * 0.18;
      const ny = ry + (my - ry) * 0.18;
      ring.style.left = nx + 'px';
      ring.style.top  = ny + 'px';
      raf = requestAnimationFrame(loop);
    };

    const onLeave  = () => { ring.classList.add('cursor-hidden'); dot.classList.add('cursor-hidden'); };
    const onEnter  = () => { ring.classList.remove('cursor-hidden'); dot.classList.remove('cursor-hidden'); };
    const onDown   = () => { ring.classList.add('cursor-clicking'); dot.style.transform = 'translate(-50%,-50%) scale(0.5)'; };
    const onUp     = () => { ring.classList.remove('cursor-clicking'); dot.style.transform = 'translate(-50%,-50%) scale(1)'; };

    const onHoverIn  = () => ring.classList.add('cursor-hovering');
    const onHoverOut = () => ring.classList.remove('cursor-hovering');

    const updateHoverables = () => {
      document.querySelectorAll<HTMLElement>('a, button, [role="button"], label, input, select, textarea, .btn, .bento-card, .cmd-card, .tutorial-card, .community-card, .accordion-trigger, .tab-btn, .nav-link').forEach(el => {
        el.addEventListener('mouseenter', onHoverIn);
        el.addEventListener('mouseleave', onHoverOut);
      });
    };

    document.addEventListener('mousemove',  onMove);
    document.addEventListener('mouseleave', onLeave);
    document.addEventListener('mouseenter', onEnter);
    document.addEventListener('mousedown',  onDown);
    document.addEventListener('mouseup',    onUp);

    // initial + re-scan after hydration
    updateHoverables();
    const observer = new MutationObserver(updateHoverables);
    observer.observe(document.body, { childList: true, subtree: true });

    raf = requestAnimationFrame(loop);

    return () => {
      document.removeEventListener('mousemove',  onMove);
      document.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('mouseenter', onEnter);
      document.removeEventListener('mousedown',  onDown);
      document.removeEventListener('mouseup',    onUp);
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <>
      <div ref={ringRef} className="cursor-ring cursor-hidden" aria-hidden="true" />
      <div ref={dotRef}  className="cursor-dot  cursor-hidden" aria-hidden="true" />
    </>
  );
}
