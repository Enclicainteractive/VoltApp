import React, { useEffect, useRef, useCallback, useState } from 'react';
import * as THREE from 'three';

const AimIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
    <circle cx="12" cy="12" r="10"/>
    <circle cx="12" cy="12" r="3"/>
    <line x1="12" y1="2" x2="12" y2="5"/>
    <line x1="12" y1="19" x2="12" y2="22"/>
    <line x1="2" y1="12" x2="5" y2="12"/>
    <line x1="19" y1="12" x2="22" y2="12"/>
  </svg>
);

const FlagIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
    <line x1="4" y1="2" x2="4" y2="22"/>
    <polyline points="4 2 20 7 4 12"/>
  </svg>
);

const COURSE_THEMES = {
  grass: {
    groundColor: 0x4a7c23,
    accentColor: 0x2d5016,
    skyColor: 0x87ceeb,
    fogColor: 0xa8e6cf,
    wallColor: 0x8b4513,
    ambientIntensity: 0.6,
    directionalIntensity: 1.0,
    particleColor: 0x90EE90
  },
  sand: {
    groundColor: 0xd4a574,
    accentColor: 0xb8956e,
    skyColor: 0xffe4b5,
    fogColor: 0xf5deb3,
    wallColor: 0x8b6914,
    ambientIntensity: 0.7,
    directionalIntensity: 1.2,
    particleColor: 0xF4A460
  },
  water: {
    groundColor: 0x2e8b8b,
    accentColor: 0x1a5f5f,
    skyColor: 0x87ceeb,
    fogColor: 0xb0e0e6,
    wallColor: 0x4a7c7c,
    ambientIntensity: 0.5,
    directionalIntensity: 0.9,
    particleColor: 0x00FFFF
  },
  stone: {
    groundColor: 0x696969,
    accentColor: 0x4a4a4a,
    skyColor: 0xb0c4de,
    fogColor: 0xd3d3d3,
    wallColor: 0x363636,
    ambientIntensity: 0.5,
    directionalIntensity: 1.0,
    particleColor: 0xA9A9A9
  },
  snow: {
    groundColor: 0xf0f8ff,
    accentColor: 0xdceef5,
    skyColor: 0xe0f0ff,
    fogColor: 0xf5f5f5,
    wallColor: 0xa0c4d8,
    ambientIntensity: 0.7,
    directionalIntensity: 0.8,
    particleColor: 0xFFFFFF
  },
  lava: {
    groundColor: 0x8b0000,
    accentColor: 0xff4500,
    skyColor: 0x2c0a0a,
    fogColor: 0x1a0505,
    wallColor: 0x3d1a1a,
    ambientIntensity: 0.4,
    directionalIntensity: 1.5,
    particleColor: 0xFF4500,
    emissive: true
  }
};

const MiniGolfCourse3D = ({
  theme = 'grass',
  holePosition = { x: 8, z: 0 },
  ballPosition: initialBallPosition = { x: -8, z: 0 },
  isPutting = false,
  onBallInHole,
  showFlag = true,
  checkpoints = [],
  obstacles = [],
  hasWater = false,
  isMyTurn = false,
  onPutt = null,
  shotRequest = null,
  onShotComplete = null,
  viewMode = '3d',
  powerups = [],
  onCollectPowerup = null
}) => {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const ballRef = useRef(null);
  const flagRef = useRef(null);
  const trailRef = useRef(null);
  const particlesRef = useRef(null);
  const glowRef = useRef(null);
  const powerupRefs = useRef({});
  
  const ballVelocityRef = useRef({ x: 0, z: 0 });
  const isAnimatingRef = useRef(false);
  const cameraTargetRef = useRef(new THREE.Vector3());
  const cameraOffsetRef = useRef(new THREE.Vector3(0, 10, 14));
  const cameraRotationRef = useRef({ theta: 0, phi: Math.PI / 6 });
  const isRightMouseDownRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const currentShotIdRef = useRef(null);
  const lastAppliedShotIdRef = useRef(null);
  
  const [isLoaded, setIsLoaded] = useState(false);
  const [ballMoving, setBallMoving] = useState(false);
  const [puttDirection, setPuttDirection] = useState(0);
  const [puttPower, setPuttPower] = useState(0);
  const [isAiming, setIsAiming] = useState(false);
  const [collectedPowerups, setCollectedPowerups] = useState([]);
  
  const themeData = COURSE_THEMES[theme] || COURSE_THEMES.grass;

  const createTrail = useCallback(() => {
    const trailGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(50 * 3);
    trailGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const trailMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.5
    });
    
    const trail = new THREE.Line(trailGeometry, trailMaterial);
    trailRef.current = trail;
    return trail;
  }, []);

  const updateTrail = useCallback((position) => {
    if (!trailRef.current) return;
    const positions = trailRef.current.geometry.attributes.position.array;
    for (let i = positions.length - 3; i >= 3; i -= 3) {
      positions[i] = positions[i - 3];
      positions[i + 1] = positions[i - 2];
      positions[i + 2] = positions[i - 1];
    }
    positions[0] = position.x;
    positions[1] = 0.18;
    positions[2] = position.z;
    trailRef.current.geometry.attributes.position.needsUpdate = true;
  }, []);

  const createCourse = useCallback((scene, td) => {
    const courseGroup = new THREE.Group();
    
    const groundGeometry = new THREE.PlaneGeometry(30, 20, 60, 40);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: td.groundColor,
      roughness: 0.85,
      metalness: 0.05
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    courseGroup.add(ground);
    
    const fairwayCount = 20;
    const fairwayGeo = new THREE.CircleGeometry(3, 24);
    const fairwayMat = new THREE.MeshStandardMaterial({
      color: td.accentColor,
      roughness: 0.6,
      metalness: 0.1
    });
    for (let i = 0; i < fairwayCount; i++) {
      const fairway = new THREE.Mesh(fairwayGeo, fairwayMat);
      const t = i / fairwayCount;
      fairway.rotation.x = -Math.PI / 2;
      fairway.position.set(-12 + t * 24, 0.02, (Math.random() - 0.5) * 8);
      fairway.scale.setScalar(0.4 + Math.random() * 0.6);
      fairway.receiveShadow = true;
      courseGroup.add(fairway);
    }
    
    const wallHeight = 0.6;
    const wallThickness = 0.4;
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: td.wallColor,
      roughness: 0.7,
      metalness: 0.2
    });
    
    const walls = [
      { pos: [0, wallHeight / 2, -10], size: [30, wallHeight, wallThickness] },
      { pos: [0, wallHeight / 2, 10], size: [30, wallHeight, wallThickness] },
      { pos: [-15, wallHeight / 2, 0], size: [wallThickness, wallHeight, 20] },
      { pos: [15, wallHeight / 2, 0], size: [wallThickness, wallHeight, 20] }
    ];
    
    walls.forEach(w => {
      const geo = new THREE.BoxGeometry(...w.size);
      const mesh = new THREE.Mesh(geo, wallMaterial);
      mesh.position.set(...w.pos);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      courseGroup.add(mesh);
    });
    
    scene.add(courseGroup);
    return courseGroup;
  }, []);

  const createHole = useCallback((scene, position) => {
    const holeGroup = new THREE.Group();
    
    const cupGeo = new THREE.CylinderGeometry(0.35, 0.3, 0.5, 24);
    const cupMat = new THREE.MeshStandardMaterial({
      color: 0x0a0a0a,
      roughness: 0.2,
      metalness: 0.9
    });
    const cup = new THREE.Mesh(cupGeo, cupMat);
    cup.position.y = -0.25;
    cup.receiveShadow = true;
    holeGroup.add(cup);
    
    const rimGeo = new THREE.TorusGeometry(0.35, 0.06, 12, 32);
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xeeeeee,
      roughness: 0.3,
      metalness: 0.7
    });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.02;
    holeGroup.add(rim);
    
    const glowGeo = new THREE.CircleGeometry(0.8, 32);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.01;
    glowRef.current = glow;
    holeGroup.add(glow);
    
    holeGroup.position.set(position.x, 0, position.z);
    scene.add(holeGroup);
    return holeGroup;
  }, []);

  const createFlag = useCallback((scene, position, td) => {
    const flagGroup = new THREE.Group();
    
    const poleGeo = new THREE.CylinderGeometry(0.04, 0.04, 3.5, 12);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x9a7b4f, roughness: 0.6, metalness: 0.3 });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 1.75;
    pole.castShadow = true;
    flagGroup.add(pole);
    
    const flagShape = new THREE.Shape();
    flagShape.moveTo(0, 0);
    flagShape.lineTo(1, 0.15);
    flagShape.lineTo(0.9, 0.9);
    flagShape.lineTo(0, 1);
    flagShape.lineTo(0, 0);
    
    const flagGeo = new THREE.ShapeGeometry(flagShape);
    const flagMat = new THREE.MeshStandardMaterial({ color: 0xff3344, side: THREE.DoubleSide, roughness: 0.4 });
    const flag = new THREE.Mesh(flagGeo, flagMat);
    flag.position.set(0.04, 2.8, 0);
    flag.castShadow = true;
    flagRef.current = flag;
    flagGroup.add(flag);
    
    const ballGeo = new THREE.SphereGeometry(0.18, 16, 16);
    const ballMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.15, metalness: 0.4 });
    const topBall = new THREE.Mesh(ballGeo, ballMat);
    topBall.position.y = 3.6;
    topBall.castShadow = true;
    flagGroup.add(topBall);
    
    flagGroup.position.set(position.x, 0, position.z);
    scene.add(flagGroup);
    return flagGroup;
  }, []);

  const createBall = useCallback((scene, position) => {
    const ballGeo = new THREE.SphereGeometry(0.18, 32, 32);
    const ballMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.15, metalness: 0.5 });
    const ball = new THREE.Mesh(ballGeo, ballMat);
    ball.position.set(position.x, 0.18, position.z);
    ball.castShadow = true;
    ball.receiveShadow = true;
    ballRef.current = ball;
    scene.add(ball);
    
    const trail = createTrail();
    scene.add(trail);
    
    return ball;
  }, [createTrail]);

  const createPowerups = useCallback((scene, powerupList) => {
    powerupList.forEach(pu => {
      if (pu.collected) return;
      
      const geo = new THREE.SphereGeometry(0.25, 16, 16);
      const mat = new THREE.MeshStandardMaterial({
        color: pu.color || 0xffdd00,
        emissive: pu.color || 0xffdd00,
        emissiveIntensity: 0.3,
        roughness: 0.3,
        metalness: 0.5
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(pu.position.x, 0.4, pu.position.z);
      mesh.userData.powerupId = pu.id;
      powerupRefs.current[pu.id] = mesh;
      scene.add(mesh);
    });
  }, []);

  const createEnvironment = useCallback((scene, camera, td) => {
    scene.background = new THREE.Color(td.skyColor);
    scene.fog = new THREE.Fog(td.fogColor, 20, 60);
    
    const ambientLight = new THREE.AmbientLight(0xffffff, td.ambientIntensity * 0.8);
    scene.add(ambientLight);
    
    const sunLight = new THREE.DirectionalLight(0xffffee, td.directionalIntensity);
    sunLight.position.set(15, 20, 10);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 60;
    sunLight.shadow.camera.left = -25;
    sunLight.shadow.camera.right = 25;
    sunLight.shadow.camera.top = 25;
    sunLight.shadow.camera.bottom = -25;
    sunLight.shadow.bias = -0.001;
    scene.add(sunLight);
    
    const hemisphereLight = new THREE.HemisphereLight(td.skyColor, td.groundColor, 0.4);
    scene.add(hemisphereLight);
    
    if (td.emissive) {
      const lavaGlow = new THREE.PointLight(0xff4400, 1, 30);
      lavaGlow.position.set(0, 2, 0);
      scene.add(lavaGlow);
    }
    
    camera.position.set(0, 12, 18);
    camera.lookAt(0, 0, 0);
  }, []);

  const updateCamera = useCallback((ballPos) => {
    if (!cameraRef.current) return;
    
    const camera = cameraRef.current;
    const { theta, phi } = cameraRotationRef.current;
    const offset = cameraOffsetRef.current.clone();
    
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), theta);
    
    const targetPos = new THREE.Vector3(
      ballPos.x + offset.x,
      offset.y,
      ballPos.z + offset.z
    );
    
    cameraTargetRef.current.lerp(targetPos, 0.08);
    camera.position.lerp(cameraTargetRef.current, 0.08);
    
    const lookAtPos = new THREE.Vector3(ballPos.x, 0, ballPos.z);
    camera.lookAt(lookAtPos);
  }, []);

  const handleMouseDown = useCallback((e) => {
    if (e.button === 2 && isMyTurn && !ballMoving) {
      isRightMouseDownRef.current = true;
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    }
  }, [isMyTurn, ballMoving]);

  const handleMouseMove = useCallback((e) => {
    if (isRightMouseDownRef.current) {
      const deltaX = e.clientX - lastMousePosRef.current.x;
      const deltaY = e.clientY - lastMousePosRef.current.y;
      
      cameraRotationRef.current.theta -= deltaX * 0.01;
      cameraRotationRef.current.phi = Math.max(0.1, Math.min(Math.PI / 2.5, 
        cameraRotationRef.current.phi + deltaY * 0.01));
      
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    }
    
    if (isAiming && isMyTurn && !ballMoving) {
      if (!ballRef.current) return;
      const ballPos = ballRef.current.position;
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      
      const dx = mouseX * 15 - ballPos.x;
      const dz = mouseY * 10 - ballPos.z;
      const angle = Math.atan2(dz, dx);
      setPuttDirection(angle);
    }
  }, [isAiming, isMyTurn, ballMoving]);

  const handleMouseUp = useCallback((e) => {
    if (e.button === 2) {
      isRightMouseDownRef.current = false;
    }
  }, []);

  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
  }, []);

  const startAiming = useCallback(() => {
    if (isMyTurn && !ballMoving && onPutt) {
      setIsAiming(true);
    }
  }, [isMyTurn, ballMoving, onPutt]);

  const updatePower = useCallback((newPower) => {
    setPuttPower(Math.min(Math.max(newPower, 0), 1));
  }, []);

  const executePutt = useCallback(() => {
    if (!isAiming || !onPutt || puttPower < 0.05) return;
    
    const force = 2.5 + puttPower * 6;
    const vx = Math.cos(puttDirection) * force;
    const vz = Math.sin(puttDirection) * force;

    setIsAiming(false);
    setPuttPower(0);
    
    onPutt({ power: puttPower, angle: puttDirection, velocity: { x: vx, z: vz } });
  }, [isAiming, puttPower, puttDirection, onPutt]);

  const finishShot = useCallback((inHole) => {
    if (!ballRef.current || !currentShotIdRef.current) return;

    const shotId = currentShotIdRef.current;
    currentShotIdRef.current = null;
    isAnimatingRef.current = false;
    ballVelocityRef.current = { x: 0, z: 0 };
    setBallMoving(false);

    onShotComplete?.({
      actionId: shotId,
      playerId: shotRequest?.playerId,
      inHole,
      finalPosition: {
        x: ballRef.current.position.x,
        z: ballRef.current.position.z
      }
    });

    if (inHole && onBallInHole) onBallInHole();
  }, [onBallInHole, onShotComplete, shotRequest?.playerId]);

  useEffect(() => {
    if (!containerRef.current) return;
    
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    
    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 1000);
    cameraRef.current = camera;
    
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    
    createEnvironment(scene, camera, themeData);
    createCourse(scene, themeData);
    createHole(scene, holePosition);
    if (showFlag) createFlag(scene, holePosition, themeData);
    createBall(scene, initialBallPosition);
    if (powerups?.length > 0) createPowerups(scene, powerups);
    
    let animationId;
    let lastFrameTime = performance.now();
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      const now = performance.now();
      const delta = Math.min((now - lastFrameTime) / 1000, 0.05);
      lastFrameTime = now;
      
      if (flagRef.current) {
        flagRef.current.rotation.y = Math.sin(Date.now() * 0.004) * 0.15;
      }
      
      if (glowRef.current) {
        glowRef.current.material.opacity = 0.1 + Math.sin(Date.now() * 0.005) * 0.05;
      }
      
      Object.values(powerupRefs.current).forEach(mesh => {
        mesh.rotation.y += 0.02;
        mesh.position.y = 0.4 + Math.sin(Date.now() * 0.003) * 0.1;
      });
      
      if (ballRef.current && isAnimatingRef.current) {
        const velocity = ballVelocityRef.current;
        const damping = Math.exp(-2.8 * delta);
        
        ballRef.current.position.x += velocity.x * delta;
        ballRef.current.position.z += velocity.z * delta;
        
        velocity.x *= damping;
        velocity.z *= damping;
        
        updateTrail(ballRef.current.position);
        
        const dx = ballRef.current.position.x - holePosition.x;
        const dz = ballRef.current.position.z - holePosition.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        if (distance < 0.45) {
          finishShot(true);
        }
        
        if (Math.hypot(velocity.x, velocity.z) < 0.08) {
          finishShot(false);
        }
        
        const bounds = 14;
        if (ballRef.current.position.x < -bounds || ballRef.current.position.x > bounds) {
          ballRef.current.position.x = Math.max(-bounds, Math.min(bounds, ballRef.current.position.x));
          velocity.x *= -0.6;
        }
        if (ballRef.current.position.z < -9 || ballRef.current.position.z > 9) {
          ballRef.current.position.z = Math.max(-9, Math.min(9, ballRef.current.position.z));
          velocity.z *= -0.6;
        }
        
        if (powerups?.length > 0) {
          powerups.forEach(pu => {
            if (pu.collected) return;
            const pdx = ballRef.current.position.x - pu.position.x;
            const pdz = ballRef.current.position.z - pu.position.z;
            const pdist = Math.sqrt(pdx * pdx + pdz * pdz);
            
            if (pdist < 0.5) {
              if (onCollectPowerup) {
                onCollectPowerup(pu);
                pu.collected = true;
                if (powerupRefs.current[pu.id]) {
                  scene.remove(powerupRefs.current[pu.id]);
                  delete powerupRefs.current[pu.id];
                }
              }
            }
          });
        }
      }
      
      if (cameraRef.current && ballRef.current) {
        updateCamera(ballRef.current.position);
      }
      
      renderer.render(scene, camera);
    };
    
    animate();
    setIsLoaded(true);
    
    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    
    window.addEventListener('resize', handleResize);
    container.addEventListener('mousedown', handleMouseDown);
    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('contextmenu', handleContextMenu);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('mousedown', handleMouseDown);
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('contextmenu', handleContextMenu);
      cancelAnimationFrame(animationId);
      
      if (rendererRef.current && containerRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
        rendererRef.current.dispose();
      }
    };
  }, [createBall, createCourse, createEnvironment, createFlag, createHole, createPowerups, finishShot, handleContextMenu, handleMouseDown, handleMouseMove, handleMouseUp, holePosition, initialBallPosition, powerups, showFlag, themeData, updateCamera, updateTrail]);

  useEffect(() => {
    if (!shotRequest?.actionId || !ballRef.current) return;
    if (lastAppliedShotIdRef.current === shotRequest.actionId) return;

    lastAppliedShotIdRef.current = shotRequest.actionId;
    currentShotIdRef.current = shotRequest.actionId;
    ballVelocityRef.current = {
      x: Number(shotRequest.velocity?.x) || 0,
      z: Number(shotRequest.velocity?.z) || 0
    };
    isAnimatingRef.current = true;
    setBallMoving(true);
  }, [shotRequest]);

  useEffect(() => {
    if (!ballRef.current || !isLoaded) return;
    ballRef.current.position.set(initialBallPosition.x, 0.18, initialBallPosition.z);
    ballVelocityRef.current = { x: 0, z: 0 };
    isAnimatingRef.current = false;
    currentShotIdRef.current = null;
    setBallMoving(false);
    
    if (trailRef.current) {
      const positions = trailRef.current.geometry.attributes.position.array;
      positions.fill(0);
      trailRef.current.geometry.attributes.position.needsUpdate = true;
    }
  }, [initialBallPosition, isLoaded]);

  const arrowLength = 40 + puttPower * 80;
  const arrowColor = puttPower > 0.7 ? '#ef4444' : puttPower > 0.4 ? '#eab308' : '#22c55e';

  return (
    <div ref={containerRef} className="minigolf-3d-container" style={{
      width: '100%',
      height: '100%',
      minHeight: '450px',
      position: 'relative',
      overflow: 'hidden',
      borderRadius: '20px',
      cursor: isMyTurn && !ballMoving ? 'crosshair' : 'default',
      background: 'linear-gradient(180deg, #1a1a2e 0%, #0d1117 100%)',
      boxShadow: 'inset 0 0 60px rgba(0, 0, 0, 0.5)'
    }}>
      {isMyTurn && !ballMoving && (
        <>
          <div className="minigolf-aim-overlay">
            <div className="minigolf-aim-instructions">
              Move mouse to aim • Right-click drag to look around
            </div>
          </div>
          
          {isAiming && (
            <>
              <div className="minigolf-putt-controls">
                <div className="minigolf-power-control">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={puttPower * 100}
                    onChange={(e) => updatePower(e.target.value / 100)}
                    className="minigolf-power-slider"
                  />
                  <div className="minigolf-power-display">
                    <span className="minigolf-power-label">Power</span>
                    <span className="minigolf-power-value" style={{ color: arrowColor }}>
                      {Math.round(puttPower * 100)}%
                    </span>
                  </div>
                </div>
                
                <button 
                  className="minigolf-putt-button"
                  onClick={executePutt}
                  disabled={puttPower < 0.05}
                  style={{ 
                    background: puttPower > 0.7 ? '#ef4444' : puttPower > 0.4 ? '#eab308' : '#22c55e',
                    opacity: puttPower < 0.05 ? 0.5 : 1
                  }}
                >
                  PUTT!
                </button>
                
                <button 
                  className="minigolf-cancel-button"
                  onClick={() => setIsAiming(false)}
                >
                  Cancel
                </button>
              </div>
              
              <div className="minigolf-aim-arrow" style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: arrowLength,
                height: 4,
                background: `linear-gradient(90deg, ${arrowColor}, transparent)`,
                transformOrigin: 'left center',
                transform: `translate(0, -50%) rotate(${-puttDirection}rad)`,
                pointerEvents: 'none',
                zIndex: 10
              }}>
                <div style={{
                  position: 'absolute',
                  right: -10,
                  top: -6,
                  width: 0,
                  height: 0,
                  borderLeft: `12px solid ${arrowColor}`,
                  borderTop: '8px solid transparent',
                  borderBottom: '8px solid transparent'
                }} />
              </div>
            </>
          )}
          
          {!isAiming && (
            <button 
              className="minigolf-start-aim-button"
              onClick={startAiming}
            >
              <AimIcon /> Aim &amp; Putt
            </button>
          )}
        </>
      )}
      
      {ballMoving && (
        <div className="minigolf-ball-moving-enhanced">
          <div className="minigolf-ball-moving-icon"><FlagIcon /></div>
          <span>Ball in motion...</span>
        </div>
      )}
      
      <div className="minigolf-view-indicator">
        <span className="minigolf-view-badge">
          {viewMode === '3d' ? '3D View' : '2D View'}
          {isRightMouseDownRef.current && ' | Dragging'}
        </span>
      </div>
    </div>
  );
};

export default MiniGolfCourse3D;
