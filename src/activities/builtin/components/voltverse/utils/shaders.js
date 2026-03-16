import * as THREE from 'three'

export const DEFAULT_SHADERS = {
  hologram: {
    name: 'Hologram',
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vPosition;
      varying vec3 vNormal;
      
      void main() {
        vUv = uv;
        vPosition = position;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 color;
      varying vec2 vUv;
      varying vec3 vPosition;
      varying vec3 vNormal;
      
      void main() {
        float scanline = sin(vPosition.y * 50.0 + time * 5.0) * 0.5 + 0.5;
        float alpha = 0.6 + scanline * 0.4;
        float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.0);
        vec3 finalColor = color + fresnel * 0.3;
        gl_FragColor = vec4(finalColor, alpha * 0.8);
      }
    `
  },
  neon: {
    name: 'Neon Glow',
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 color;
      varying vec2 vUv;
      varying vec3 vNormal;
      
      void main() {
        float intensity = pow(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
        float pulse = sin(time * 3.0) * 0.2 + 0.8;
        vec3 glow = color * intensity * pulse * 2.0;
        vec3 base = color * 0.3;
        gl_FragColor = vec4(base + glow, 1.0);
      }
    `
  },
  water: {
    name: 'Water',
    vertexShader: `
      uniform float time;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      
      void main() {
        vUv = uv;
        vec3 pos = position;
        pos.y += sin(pos.x * 2.0 + time) * 0.1;
        pos.y += sin(pos.z * 1.5 + time * 0.8) * 0.1;
        vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 deepColor;
      uniform vec3 shallowColor;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      
      void main() {
        float wave = sin(vWorldPos.x * 5.0 + time * 2.0) * 
                     sin(vWorldPos.z * 4.0 + time * 1.5);
        vec3 color = mix(deepColor, shallowColor, wave * 0.5 + 0.5);
        float fresnel = pow(1.0 - abs(dot(normalize(vWorldPos), vec3(0.0, 1.0, 0.0))), 3.0);
        color += vec3(0.5, 0.7, 1.0) * fresnel * 0.3;
        gl_FragColor = vec4(color, 0.9);
      }
    `
  },
  fire: {
    name: 'Fire',
    vertexShader: `
      uniform float time;
      varying vec2 vUv;
      varying vec3 vPosition;
      
      void main() {
        vUv = uv;
        vPosition = position;
        vec3 pos = position;
        pos.x += sin(position.y * 10.0 + time * 5.0) * 0.05 * (1.0 - position.y);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      varying vec2 vUv;
      varying vec3 vPosition;
      
      vec3 fire(float t) {
        vec3 c1 = vec3(1.0, 0.0, 0.0);
        vec3 c2 = vec3(1.0, 0.6, 0.0);
        vec3 c3 = vec3(1.0, 1.0, 0.8);
        return mix(c1, c2, t) * mix(c2, c3, t);
      }
      
      void main() {
        float t = vUv.y + sin(vUv.x * 10.0 + time * 5.0) * 0.1;
        vec3 color = fire(t);
        float alpha = 1.0 - smoothstep(0.0, 1.0, vUv.y);
        alpha *= 0.8 + sin(vUv.x * 20.0 + time * 10.0) * 0.2;
        gl_FragColor = vec4(color, alpha);
      }
    `
  },
  ice: {
    name: 'Ice',
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 color;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      
      void main() {
        vec3 viewDir = normalize(vViewPosition);
        float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 3.0);
        vec3 iceColor = color + vec3(0.3, 0.5, 0.7) * fresnel;
        float sparkle = sin(vUv.x * 50.0 + time * 2.0) * sin(vUv.y * 50.0 - time * 1.5);
        iceColor += vec3(1.0) * max(sparkle, 0.0) * 0.3;
        gl_FragColor = vec4(iceColor, 0.9);
      }
    `
  },
  plasma: {
    name: 'Plasma',
    vertexShader: `
      uniform float time;
      varying vec2 vUv;
      varying vec3 vPosition;
      
      void main() {
        vUv = uv;
        vPosition = position;
        vec3 pos = position;
        pos += normal * sin(time * 2.0 + position.x * 5.0) * 0.05;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      varying vec2 vUv;
      varying vec3 vPosition;
      
      void main() {
        float v = sin(vPosition.x * 10.0 + time);
        v += sin(vPosition.y * 10.0 + time * 1.5);
        v += sin(vPosition.z * 10.0 + time * 0.5);
        v += sin((vPosition.x + vPosition.y + vPosition.z) * 5.0 + time * 2.0);
        v *= 0.25;
        vec3 color = vec3(
          sin(v * 3.14159) * 0.5 + 0.5,
          sin(v * 3.14159 + 2.094) * 0.5 + 0.5,
          sin(v * 3.14159 + 4.188) * 0.5 + 0.5
        );
        gl_FragColor = vec4(color, 1.0);
      }
    `
  },
  wireframe: {
    name: 'Wireframe',
    vertexShader: `
      varying vec3 vPosition;
      varying vec3 vBarycentric;
      
      void main() {
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform float thickness;
      varying vec3 vPosition;
      
      void main() {
        gl_FragColor = vec4(color, 1.0);
      }
    `
  },
  toon: {
    name: 'Toon',
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPosition.xyz);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform vec3 lightDir;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      
      void main() {
        float intensity = dot(vNormal, normalize(lightDir));
        float toon;
        if (intensity > 0.95) toon = 1.0;
        else if (intensity > 0.5) toon = 0.7;
        else if (intensity > 0.25) toon = 0.4;
        else toon = 0.2;
        
        float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);
        rim = smoothstep(0.6, 1.0, rim);
        
        vec3 finalColor = color * toon + vec3(1.0) * rim * 0.3;
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `
  }
}

export const DEFAULT_MATERIAL_PRESETS = {
  standard: { type: 'standard', color: '#6366f1', roughness: 0.5, metalness: 0.1, transparent: false, opacity: 1 },
  matte: { type: 'standard', color: '#94a3b8', roughness: 0.95, metalness: 0.02, transparent: false, opacity: 1 },
  metal: { type: 'standard', color: '#cbd5e1', roughness: 0.22, metalness: 0.92, transparent: false, opacity: 1 },
  glass: { type: 'physical', color: '#dbeafe', roughness: 0.08, metalness: 0.05, transparent: true, opacity: 0.38, transmission: 0.92, thickness: 0.8 },
  emissive: { type: 'standard', color: '#38bdf8', emissive: '#38bdf8', emissiveIntensity: 1.1, roughness: 0.25, metalness: 0.15, transparent: false, opacity: 1 },
  toon: { type: 'shader', shaderId: 'toon', color: '#f97316' },
  hologram: { type: 'shader', shaderId: 'hologram', color: '#22d3ee' },
  neon: { type: 'shader', shaderId: 'neon', color: '#ec4899' },
  water: { type: 'shader', shaderId: 'water', color: '#38bdf8', transparent: true, opacity: 0.9 }
}

export const DEFAULT_SKYBOXES = {
  'sunset-gradient': { backgroundTop: '#f97316', backgroundBottom: '#190b2d', accent: '#facc15', stars: true },
  'deep-space': { backgroundTop: '#030712', backgroundBottom: '#111827', accent: '#93c5fd', stars: true },
  'cloudy-day': { backgroundTop: '#dbeafe', backgroundBottom: '#93c5fd', accent: '#ffffff', stars: false },
  aurora: { backgroundTop: '#052e16', backgroundBottom: '#0f172a', accent: '#34d399', stars: true },
  studio: { backgroundTop: '#334155', backgroundBottom: '#0f172a', accent: '#f8fafc', stars: false },
  'cyber-grid': { backgroundTop: '#111827', backgroundBottom: '#050816', accent: '#a855f7', stars: true }
}

export const resolveShaderConfig = (material = {}, shaderLibrary = []) => {
  const inlineShader = material.shader === true || material.type === 'shader'
  if (material.shaderId) {
    return shaderLibrary.find((entry) => entry.id === material.shaderId) || DEFAULT_SHADERS[material.shaderId] || null
  }
  if (inlineShader) {
    return {
      vertexShader: material.vertexShader || DEFAULT_SHADERS.hologram.vertexShader,
      fragmentShader: material.fragmentShader || DEFAULT_SHADERS.hologram.fragmentShader,
      uniforms: material.uniforms || {},
      color: material.color
    }
  }
  if (material.preset && DEFAULT_SHADERS[material.preset]) {
    return { ...DEFAULT_SHADERS[material.preset], color: material.color }
  }
  return null
}

export const resolveMaterialConfig = (material = {}) => {
  const preset = DEFAULT_MATERIAL_PRESETS[material.preset] || DEFAULT_MATERIAL_PRESETS[material.type] || DEFAULT_MATERIAL_PRESETS.standard
  return {
    ...preset,
    ...material,
    color: material.color || preset.color || '#6366f1',
    emissive: material.emissive || preset.emissive || '#000000',
    emissiveIntensity: material.emissiveIntensity ?? preset.emissiveIntensity ?? 0,
    roughness: material.roughness ?? preset.roughness ?? 0.5,
    metalness: material.metalness ?? preset.metalness ?? 0.1,
    opacity: material.opacity ?? preset.opacity ?? 1,
    transparent: material.transparent ?? preset.transparent ?? false
  }
}

export const resolveSkyboxConfig = (skybox = {}) => {
  const presetId = typeof skybox === 'string' ? skybox : skybox.preset || 'sunset-gradient'
  return {
    ...(DEFAULT_SKYBOXES[presetId] || DEFAULT_SKYBOXES['sunset-gradient']),
    ...(typeof skybox === 'object' ? skybox : {})
  }
}

export const createShaderMaterial = (shaderConfig, uniforms = {}) => {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      color: { value: new THREE.Color(shaderConfig.color || '#6366f1') },
      ...shaderConfig.uniforms,
      ...uniforms
    },
    vertexShader: shaderConfig.vertexShader,
    fragmentShader: shaderConfig.fragmentShader,
    transparent: shaderConfig.transparent ?? true,
    side: shaderConfig.side || THREE.DoubleSide,
    wireframe: shaderConfig.wireframe ?? false
  })
}

export const compileShader = (gl, type, source) => {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  
  return shader
}

export const createShaderProgram = (gl, vertexSource, fragmentSource) => {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource)
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource)
  
  if (!vertexShader || !fragmentShader) return null
  
  const program = gl.createProgram()
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program))
    return null
  }
  
  return program
}

export const validateShaderSyntax = (shaderCode) => {
  const errors = []
  
  const commonErrors = [
    { pattern: /gl_FragColor\s*=/, message: 'Use gl_FragColor correctly' },
    { pattern: /gl_Position\s*=/, message: 'Use gl_Position correctly' },
    { pattern: /varying\s+\w+\s+\w+;/, message: 'Check varying declaration' },
    { pattern: /uniform\s+\w+\s+\w+;/, message: 'Check uniform declaration' }
  ]
  
  commonErrors.forEach(({ pattern, message }) => {
    if (!pattern.test(shaderCode)) {
      errors.push(message)
    }
  })
  
  const openBraces = (shaderCode.match(/{/g) || []).length
  const closeBraces = (shaderCode.match(/}/g) || []).length
  if (openBraces !== closeBraces) {
    errors.push('Mismatched braces in shader')
  }
  
  return {
    valid: errors.length === 0,
    errors
  }
}
