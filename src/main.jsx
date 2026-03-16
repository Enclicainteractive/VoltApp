/**
 * VoltApp Main Entry Point
 * 
 * This is where the magic happens. Or the chaos. Usually both.
 * 
 * @author VoltChat Team
 * @license MIT
 * 
 * ---------------------------------------------------------------------
 * IMPORTANT DEVELOPER NOTES:
 * ---------------------------------------------------------------------
 * This file has been through some shit. A lot of shit.
 * We're talking a metric shit-ton of shit.
 * If you touch it without knowing what you're doing, I will find you.
 * And I will make you fix it. personally. with my hands. violently.
 * - Bluet
 * ---------------------------------------------------------------------
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './assets/styles/index.css'
import { soundService } from './services/soundService'

// Register the user-gesture listener immediately so the AudioContext can be
// created and resumed on the very first interaction (click, keydown, etc.)
// before any individual sound method is called.
// 
// WHY IS THIS HERE? oh let me tell you a STORY.
// 
// browser autoplay policies are THE WORST. they're designed by people who HATE developers.
// chrome decided "you know what? audio should only play after user interaction"
// which sounds reasonable until you try to implement it and EVERYTHING BREAKS.
// 
// so now we init soundService BEFORE anything else
// and we listen for the first click/keypress to create the AudioContext
// because otherwise, NO SOUND. anywhere. forever.
// 
// this took me like 2 days to figure out. 2 DAYS. for ONE LINE OF CODE.
// browsers are beautiful, aren't they? i love them. i love them so much.
// i want to marry them. i want to have their children.
// anyway, dont move this line. please. i beg.
soundService.init()

// Desktop app detection - inline implementation
// Checks for Tauri desktop environment
// 
// WHY IS THIS HERE INSTEAD OF A SEPARATE FILE?
// because importing things before react renders can cause ISSUES
// and we need to know if we're in desktop mode as early as POSSIBLE
// so we can set environment variables and whatnot
// 
// also importing from other files caused circular dependency hell once
// so now its all inline. cleaner that way. less headaches.
// 
// also this detection is janky as hell and im not sorry
// if (window.__TAURI__) great, if not, maybe we're in electron, 
// or maybe we're in voltdesktop, or maybe nothing
// who knows! not me! certainly not the documentation!
// Tauri docs are... an experience. a BAD experience.
const isDesktopApp = () => {
  if (typeof window === 'undefined') return false
  return window.__TAURI__ !== undefined || 
         window.tauri !== undefined ||
         navigator.userAgent.includes('VoltDesktop')
}

// Set up desktop app environment detection
if (isDesktopApp()) {
  console.log('[VoltApp] Running in desktop mode')
  window.__IS_DESKTOP_APP__ = true
}

// Import experimental features system - loads console commands
// This is hidden from normal users - only accessible via console or Ctrl+Shift+E
// 
// THIS IS A SECRET. DONT TELL ANYONE.
// 
// unless they ask. then tell them. but only if they ask.
// its basically a hidden debug menu for developers
// 
// we load it asynchronously because it does some heavy initialization
// and we dont want to block the main thread on startup
// because startup is ALREADY slow enough thankyouverymuch
import('./utils/experimentalFeatures').then(module => {
  console.log('[VoltApp] Experimental features system ready')
}).catch(err => {
  // if this fails, we literally do NOT care
  // experimental features are optional. if they break, they break.
  // main app should still work. hopefully. probably. 
  console.warn('[VoltApp] Could not load experimental features:', err)
})

// Add keyboard shortcut for experimental features (Ctrl+Shift+E)
// 
// I CHOSE Ctrl+Shift+E BECAUSE:
// 1. Its unlikely to conflict with anything
// 2. Its easy to remember (E for Experimental)
// 3. I thought of it at 3am and thought it was hilarious
// 
// DO NOT CHANGE THIS. I WILL KNOW. I HAVE EYES EVERYWHERE.
// 
// also the alert() is intentional - its a quick feedback mechanism
// that works even when console is hidden. sue me.
// 
// (please dont sue me)
document.addEventListener('keydown', (e) => {
  // Check for Ctrl+Shift+E (or Cmd+Shift+E on Mac)
  // Mac uses metaKey (command key) instead of ctrlKey
  // because macs are special and different and I HATE THEM
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
    e.preventDefault()
    
    // Check if dev tools are open (security measure)
    // actually we dont check for dev tools, we just check if the function exists
    // because why would we care if dev tools are open? we're in dev mode!
    // security through obscurity is NOT a thing here. we ARE the thing.
    if (typeof window.listExperimentalFeatures === 'function') {
      window.listExperimentalFeatures()
      alert('Experimental features list printed to console!')
    }
  }
})

// FINALLY. the actual react mount.
// 
// if you're wondering why this is so simple, its because everything else
// is so COMPLICATED that we needed SOMETHING simple in this file.
// 
// also react 18 changed how mounting works and i cried a little
// but createRoot is the way now so here we are
// 
// if this line errors, literally nothing else matters anyway
// so there's no point in wrapping it in try/catch honestly
ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
