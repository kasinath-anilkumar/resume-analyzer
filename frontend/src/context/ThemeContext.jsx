import React, { createContext, useContext, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

const ThemeContext = createContext();

const applyThemeClass = (dark) => {
  document.documentElement.classList.toggle('dark', dark);
  document.body.classList.toggle('dark', dark);
};

export const ThemeProvider = ({ children }) => {
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved) {
      return saved === 'dark';
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    applyThemeClass(darkMode);
    localStorage.setItem('theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  // Toggle with a circular "wave" reveal originating from the click point.
  // Uses the View Transitions API where supported; otherwise toggles instantly.
  const toggleTheme = (event) => {
    const next = !darkMode;

    const supportsVT = typeof document !== 'undefined' && typeof document.startViewTransition === 'function';
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!supportsVT || reduceMotion) {
      setDarkMode(next);
      return;
    }

    // Circle origin = the toggle button (fallback to top-right of the header).
    const x = event?.clientX ?? window.innerWidth - 48;
    const y = event?.clientY ?? 48;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    const goingDark = next; // target theme is dark
    document.documentElement.dataset.themeTransition = goingDark ? 'to-dark' : 'to-light';

    const transition = document.startViewTransition(() => {
      // Update the DOM synchronously so the "after" snapshot reflects the new theme.
      flushSync(() => {
        setDarkMode(next);
        applyThemeClass(next);
      });
    });

    transition.ready.then(() => {
      const grow = [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${endRadius}px at ${x}px ${y}px)`,
      ];
      // Going dark: the new (dark) layer grows outward.
      // Going light: the old (dark) layer shrinks back to the origin.
      document.documentElement.animate(
        { clipPath: goingDark ? grow : [...grow].reverse() },
        {
          duration: 550,
          easing: 'ease-in-out',
          pseudoElement: goingDark ? '::view-transition-new(root)' : '::view-transition-old(root)',
        }
      );
    });

    transition.finished.finally(() => {
      delete document.documentElement.dataset.themeTransition;
    });
  };

  return (
    <ThemeContext.Provider value={{ darkMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
