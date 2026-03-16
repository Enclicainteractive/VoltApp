/**
 * useModalAnimation.js
 * Feature 2: Comprehensive animation system for modals
 */
import { useState, useCallback, useEffect, useRef } from 'react';

const ANIMATION_DURATIONS = {
  none: 0,
  fade: 300,
  slide: 400,
  bounce: 500,
  scale: 350,
  elastic: 600,
  flip: 500,
  glitch: 400,
};

const useModalAnimation = (options = {}) => {
  const {
    entranceAnimation = 'fade',
    exitAnimation = 'fade-out',
    duration: customDuration,
    onOpen,
    onClose,
    onAnimationStart,
    onAnimationEnd,
  } = options;

  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationState, setAnimationState] = useState('closed'); // 'closed', 'opening', 'open', 'closing'
  const timeoutRef = useRef(null);

  const duration = customDuration || ANIMATION_DURATIONS[entranceAnimation] || 300;

  const clearAnimationTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const open = useCallback(() => {
    clearAnimationTimeout();
    setIsAnimating(true);
    setAnimationState('opening');
    onAnimationStart?.('opening');

    // Small delay to ensure DOM is ready
    requestAnimationFrame(() => {
      setIsVisible(true);
      
      timeoutRef.current = setTimeout(() => {
        setIsAnimating(false);
        setAnimationState('open');
        onAnimationEnd?.('opening');
        onOpen?.();
      }, duration);
    });
  }, [clearAnimationTimeout, duration, onAnimationStart, onAnimationEnd, onOpen]);

  const close = useCallback(() => {
    clearAnimationTimeout();
    setIsAnimating(true);
    setAnimationState('closing');
    onAnimationStart?.('closing');

    timeoutRef.current = setTimeout(() => {
      setIsVisible(false);
      setIsAnimating(false);
      setAnimationState('closed');
      onAnimationEnd?.('closing');
      onClose?.();
    }, duration);
  }, [clearAnimationTimeout, duration, onAnimationStart, onAnimationEnd, onClose]);

  const toggle = useCallback(() => {
    if (isVisible || animationState === 'opening') {
      close();
    } else {
      open();
    }
  }, [isVisible, animationState, close, open]);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearAnimationTimeout();
  }, [clearAnimationTimeout]);

  // Get CSS classes based on animation state
  const getAnimationClasses = useCallback(() => {
    const classes = ['modal-animated'];
    
    if (animationState === 'opening') {
      classes.push(`modal-entering`, `modal-${entranceAnimation}-enter`);
    } else if (animationState === 'open') {
      classes.push('modal-open');
    } else if (animationState === 'closing') {
      classes.push(`modal-exiting`, `modal-${exitAnimation}-exit`);
    }
    
    if (isAnimating) {
      classes.push('modal-animating');
    }
    
    return classes.join(' ');
  }, [animationState, entranceAnimation, exitAnimation, isAnimating]);

  // Get inline styles for animations
  const getAnimationStyles = useCallback(() => {
    return {
      '--modal-animation-duration': `${duration}ms`,
    };
  }, [duration]);

  return {
    isVisible,
    isAnimating,
    animationState,
    open,
    close,
    toggle,
    getAnimationClasses,
    getAnimationStyles,
    duration,
  };
};

// Hook for managing multiple modals with stacking
export const useModalStack = () => {
  const [modals, setModals] = useState([]);
  const modalIdRef = useRef(0);

  const pushModal = useCallback((component, props = {}) => {
    const id = ++modalIdRef.current;
    const modal = { id, component, props, isOpen: true };
    setModals(prev => [...prev, modal]);
    return id;
  }, []);

  const popModal = useCallback((id) => {
    if (id) {
      setModals(prev => prev.filter(m => m.id !== id));
    } else {
      setModals(prev => prev.slice(0, -1));
    }
  }, []);

  const closeAllModals = useCallback(() => {
    setModals([]);
  }, []);

  const updateModal = useCallback((id, updates) => {
    setModals(prev => 
      prev.map(m => m.id === id ? { ...m, ...updates } : m)
    );
  }, []);

  const getTopModal = useCallback(() => {
    return modals[modals.length - 1];
  }, [modals]);

  return {
    modals,
    pushModal,
    popModal,
    closeAllModals,
    updateModal,
    getTopModal,
    hasOpenModals: modals.length > 0,
  };
};

// Hook for focus trap within modals
export const useModalFocus = (isOpen, onClose) => {
  const modalRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      // Store previously focused element
      previousFocusRef.current = document.activeElement;
      
      // Focus first focusable element in modal
      const focusableElements = modalRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      
      if (focusableElements?.length > 0) {
        focusableElements[0].focus();
      }
    } else if (previousFocusRef.current) {
      // Restore focus when modal closes
      previousFocusRef.current.focus();
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose?.();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return modalRef;
};

export { ANIMATION_DURATIONS };
export default useModalAnimation;
