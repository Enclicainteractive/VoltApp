/**
 * ProfileEffects.jsx
 * Feature 7: Banner effects and visual effects component
 */
import React, { useEffect, useRef } from 'react';
import './ProfileEffects.css';

const ProfileEffects = ({ effect }) => {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || effect === 'none') return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let particles = [];
    let animationId;

    const resize = () => {
      const parent = canvas.parentElement;
      canvas.width = parent.offsetWidth;
      canvas.height = parent.offsetHeight;
    };

    const createParticles = () => {
      particles = [];
      const count = effect === 'particle-float' ? 50 : 30;
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 3 + 1,
          speedX: (Math.random() - 0.5) * 0.5,
          speedY: (Math.random() - 0.5) * 0.5,
          opacity: Math.random() * 0.5 + 0.2,
        });
      }
    };

    const drawParticles = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      particles.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`;
        ctx.fill();

        p.x += p.speedX;
        p.y += p.speedY;

        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
      });

      animationId = requestAnimationFrame(drawParticles);
    };

    const drawAurora = () => {
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, 'rgba(31, 182, 255, 0.3)');
      gradient.addColorStop(0.5, 'rgba(138, 92, 246, 0.3)');
      gradient.addColorStop(1, 'rgba(244, 114, 182, 0.3)');
      
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Animated aurora waves
      const time = Date.now() * 0.001;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(0, canvas.height);
        
        for (let x = 0; x <= canvas.width; x += 10) {
          const y = canvas.height - 100 + 
            Math.sin(x * 0.01 + time + i) * 30 +
            Math.sin(x * 0.02 + time * 0.5 + i * 2) * 20;
          ctx.lineTo(x, y);
        }
        
        ctx.lineTo(canvas.width, canvas.height);
        ctx.closePath();
        
        const waveGradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
        waveGradient.addColorStop(0, `rgba(31, 182, 255, ${0.1 + i * 0.05})`);
        waveGradient.addColorStop(0.5, `rgba(138, 92, 246, ${0.1 + i * 0.05})`);
        waveGradient.addColorStop(1, `rgba(244, 114, 182, ${0.1 + i * 0.05})`);
        ctx.fillStyle = waveGradient;
        ctx.fill();
      }

      animationId = requestAnimationFrame(drawAurora);
    };

    resize();
    createParticles();

    if (effect === 'particle-float' || effect === 'pulse') {
      drawParticles();
    } else if (effect === 'aurora') {
      drawAurora();
    }

    window.addEventListener('resize', resize);

    return () => {
      window.removeEventListener('resize', resize);
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, [effect]);

  if (effect === 'none') return null;

  return (
    <canvas
      ref={canvasRef}
      className={`profile-effects-canvas effect-${effect}`}
    />
  );
};

export default ProfileEffects;
