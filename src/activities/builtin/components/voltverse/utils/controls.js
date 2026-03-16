export const createKeyboardMap = () => [
  { name: 'forward', keys: ['KeyW', 'ArrowUp'] },
  { name: 'backward', keys: ['KeyS', 'ArrowDown'] },
  { name: 'left', keys: ['KeyA', 'ArrowLeft'] },
  { name: 'right', keys: ['KeyD', 'ArrowRight'] },
  { name: 'jump', keys: ['Space'] },
  { name: 'run', keys: ['ShiftLeft', 'ShiftRight'] },
  { name: 'crouch', keys: ['KeyC'] },
  { name: 'emote1', keys: ['Digit1'] },
  { name: 'emote2', keys: ['Digit2'] },
  { name: 'emote3', keys: ['Digit3'] },
  { name: 'emote4', keys: ['Digit4'] },
  { name: 'mic', keys: ['KeyM'] },
  { name: 'menu', keys: ['Escape'] },
  { name: 'sit', keys: ['KeyZ'] },
  { name: 'inventory', keys: ['KeyI'] }
]

export const createGamepadMap = () => ({
  leftStick: {
    x: 'axes.0',
    y: 'axes.1',
    deadzone: 0.15
  },
  rightStick: {
    x: 'axes.2',
    y: 'axes.3',
    deadzone: 0.15
  },
  buttons: {
    a: 0,
    b: 1,
    x: 2,
    y: 3,
    leftShoulder: 4,
    rightShoulder: 5,
    leftTrigger: 6,
    rightTrigger: 7,
    back: 8,
    start: 9,
    leftStick: 10,
    rightStick: 11,
    dpadUp: 12,
    dpadDown: 13,
    dpadLeft: 14,
    dpadRight: 15
  }
})

export const VR_CONTROLS_CONFIG = {
  teleport: {
    button: 'trigger',
    holdTime: 0.5
  },
  grab: {
    button: 'grip',
    threshold: 0.5
  },
  menu: {
    button: 'menu'
  },
  move: {
    type: 'thumbstick',
    deadzone: 0.2
  }
}

export const LOCOMOTION_TYPES = {
  smooth: {
    name: 'Smooth Locomotion',
    description: 'Continuous movement with thumbstick'
  },
  snap: {
    name: 'Snap Turn',
    description: 'Rotate in fixed increments'
  },
  teleportation: {
    name: 'Teleportation',
    description: 'Point and teleport to location'
  }
}

export const MOVEMENT_SPEEDS = {
  walk: 2.5,
  run: 5.0,
  crouch: 1.5,
  swim: 1.0,
  fly: 10.0
}

export const EMOTE_ANIMATIONS = {
  wave: { duration: 2, loop: false },
  dance: { duration: 4, loop: true },
  clap: { duration: 1.5, loop: false },
  point: { duration: 2, loop: false },
  thumbsUp: { duration: 1.5, loop: false },
  shrug: { duration: 2, loop: false },
  nod: { duration: 1, loop: false },
  shakeHead: { duration: 1, loop: false },
  jump: { duration: 1, loop: false },
  spin: { duration: 2, loop: false }
}

export const CONTROLS_HINTS = {
  desktop: {
    movement: 'WASD or Arrow Keys',
    jump: 'Space',
    run: 'Shift',
    crouch: 'C',
    sit: 'Z',
    emote1: '1',
    emote2: '2',
    emote3: '3',
    emote4: '4',
    menu: 'Escape',
    mic: 'M',
    inventory: 'I'
  },
  gamepad: {
    movement: 'Left Stick',
    look: 'Right Stick',
    jump: 'A Button',
    grab: 'Grip',
    menu: 'Menu Button',
    teleport: 'Trigger (hold)'
  },
  vr: {
    teleport: 'Point and hold trigger',
    grab: 'Grip button',
    move: 'Thumbstick',
    menu: 'Menu button'
  }
}

export class InputManager {
  constructor() {
    this.keyboard = new Map()
    this.mouse = { x: 0, y: 0, buttons: new Set() }
    this.gamepad = null
    this.touch = new Map()
    this.vrControllers = new Map()
    
    this.setupKeyboardListeners()
    this.setupMouseListeners()
    this.setupGamepadListeners()
    this.setupTouchListeners()
  }

  setupKeyboardListeners() {
    window.addEventListener('keydown', (e) => {
      this.keyboard.set(e.code, true)
    })
    
    window.addEventListener('keyup', (e) => {
      this.keyboard.set(e.code, false)
    })
  }

  setupMouseListeners() {
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX
      this.mouse.y = e.clientY
    })
    
    window.addEventListener('mousedown', (e) => {
      this.mouse.buttons.add(e.button)
    })
    
    window.addEventListener('mouseup', (e) => {
      this.mouse.buttons.delete(e.button)
    })
  }

  setupGamepadListeners() {
    window.addEventListener('gamepadconnected', (e) => {
      this.gamepad = e.gamepad
      console.log('[Input] Gamepad connected:', e.gamepad.id)
    })
    
    window.addEventListener('gamepaddisconnected', () => {
      this.gamepad = null
      console.log('[Input] Gamepad disconnected')
    })
  }

  setupTouchListeners() {
    window.addEventListener('touchstart', (e) => {
      e.touches.forEach(t => {
        this.touch.set(t.identifier, { x: t.clientX, y: t.clientY })
      })
    })
    
    window.addEventListener('touchmove', (e) => {
      e.touches.forEach(t => {
        this.touch.set(t.identifier, { x: t.clientX, y: t.clientY })
      })
    })
    
    window.addEventListener('touchend', (e) => {
      e.changedTouches.forEach(t => {
        this.touch.delete(t.identifier)
      })
    })
  }

  isKeyPressed(...keys) {
    return keys.some(key => this.keyboard.get(key))
  }

  isMouseButtonPressed(button) {
    return this.mouse.buttons.has(button)
  }

  getMousePosition() {
    return { x: this.mouse.x, y: this.mouse.y }
  }

  getGamepadState() {
    if (!this.gamepad) return null
    
    const gamepads = navigator.getGamepads()
    const gp = gamepads[this.gamepad.index]
    
    if (!gp) return null
    
    return {
      axes: gp.axes,
      buttons: gp.buttons.map(b => b.pressed),
      connected: gp.connected,
      id: gp.id
    }
  }

  getTouchPositions() {
    return Array.from(this.touch.values())
  }

  destroy() {
    this.keyboard.clear()
    this.mouse.buttons.clear()
    this.touch.clear()
    this.vrControllers.clear()
  }
}

export default {
  createKeyboardMap,
  createGamepadMap,
  VR_CONTROLS_CONFIG,
  LOCOMOTION_TYPES,
  MOVEMENT_SPEEDS,
  EMOTE_ANIMATIONS,
  CONTROLS_HINTS,
  InputManager
}
