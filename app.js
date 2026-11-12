(() => {
  "use strict";

  // 1. Dialog Light-Dismiss Fallback
  const allDialogs = document.querySelectorAll("dialog");
  if (typeof HTMLDialogElement !== "undefined" && !("closedBy" in HTMLDialogElement.prototype)) {
    allDialogs.forEach((dialog) => {
      dialog.addEventListener("click", (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (isDialogContent) return;
        dialog.close();
      });
    });
  }

  // 2. Theme Toggle
  const themeToggleBtn = document.getElementById("theme-toggle-btn");
  const themeIcon = document.getElementById("theme-icon");
  const colorSchemeMeta = document.querySelector('meta[name="color-scheme"]');
  const darkMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

  function getEffectiveTheme() {
    const saved = localStorage.getItem("color-scheme");
    if (saved === "light" || saved === "dark") return saved;
    if (document.documentElement.classList.contains("theme-light")) return "light";
    if (document.documentElement.classList.contains("theme-dark")) return "dark";
    return darkMediaQuery.matches ? "dark" : "light";
  }

  function applyTheme(scheme, persist = false) {
    colorSchemeMeta.content = scheme;
    document.documentElement.classList.toggle("theme-light", scheme === "light");
    document.documentElement.classList.toggle("theme-dark", scheme === "dark");
    themeIcon.textContent = scheme === "dark" ? "🌙" : "☀️";
    if (persist) {
      localStorage.setItem("color-scheme", scheme);
    }
  }

  applyTheme(getEffectiveTheme(), false);

  themeToggleBtn.addEventListener("click", () => {
    const nextScheme = getEffectiveTheme() === "dark" ? "light" : "dark";
    applyTheme(nextScheme, true);
  });

  darkMediaQuery.addEventListener("change", (e) => {
    if (!localStorage.getItem("color-scheme")) {
      applyTheme(e.matches ? "dark" : "light", false);
    }
  });

  // 3. IndexedDB Storage (Local Music & Photos)
  const DB_NAME = "calm_local_vault_v1";
  const DB_VERSION = 1;
  const STORE_MUSIC = "music_tracks";
  const STORE_PHOTOS = "peace_photos";

  function openVaultDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_MUSIC)) {
          db.createObjectStore(STORE_MUSIC, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORE_PHOTOS)) {
          db.createObjectStore(STORE_PHOTOS, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbGetAll(storeName) {
    const db = await openVaultDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbPut(storeName, item) {
    const db = await openVaultDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function dbDelete(storeName, id) {
    const db = await openVaultDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // 4. Local Healing Music Engine
  const healingAudio = document.getElementById("healing-audio");
  const audioToggleBtn = document.getElementById("audio-toggle-btn");
  const audioIcon = document.getElementById("audio-icon");
  const openMusicBtn = document.getElementById("open-music-btn");
  const musicDialog = document.getElementById("music-dialog");
  const localMusicInput = document.getElementById("local-music-input");
  const musicTrackList = document.getElementById("music-track-list");

  const BUILTIN_TRACK = {
    id: "builtin-default-wav",
    title: "Deep Sea 432Hz (Built-in)",
    url: "./music/default-calm.wav",
    isBuiltin: true
  };

  let isMusicEnabled = localStorage.getItem("calm_music_enabled") !== "false";
  let activeTrackId = localStorage.getItem("calm_active_track_id") || BUILTIN_TRACK.id;
  let customTracks = [];
  let currentObjectUrl = null;

  function updateAudioButtonUI(playing) {
    audioToggleBtn.dataset.playing = playing ? "true" : "false";
    audioIcon.textContent = isMusicEnabled ? "🔊" : "🔇";
  }

  async function loadAndPlayActiveTrack() {
    customTracks = await dbGetAll(STORE_MUSIC);
    const target = customTracks.find((t) => t.id === activeTrackId);

    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = null;
    }

    if (target && target.blob) {
      currentObjectUrl = URL.createObjectURL(target.blob);
      healingAudio.src = currentObjectUrl;
    } else {
      activeTrackId = BUILTIN_TRACK.id;
      healingAudio.src = BUILTIN_TRACK.url;
    }

    healingAudio.volume = 0.55;
    renderTrackList();

    if (isMusicEnabled) {
      try {
        await healingAudio.play();
        updateAudioButtonUI(true);
      } catch {
        updateAudioButtonUI(false);
      }
    } else {
      healingAudio.pause();
      updateAudioButtonUI(false);
    }
  }

  function unlockAudioOnFirstGesture() {
    if (isMusicEnabled && healingAudio.paused) {
      healingAudio.play().then(() => {
        updateAudioButtonUI(true);
      }).catch(() => {});
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
  }
  document.addEventListener("pointerdown", unlockAudioOnFirstGesture, { passive: true });

  audioToggleBtn.addEventListener("click", async () => {
    isMusicEnabled = !isMusicEnabled;
    localStorage.setItem("calm_music_enabled", String(isMusicEnabled));
    if (isMusicEnabled) {
      try {
        await healingAudio.play();
        updateAudioButtonUI(true);
      } catch {
        updateAudioButtonUI(false);
      }
    } else {
      healingAudio.pause();
      updateAudioButtonUI(false);
    }
  });

  openMusicBtn.addEventListener("click", () => {
    renderTrackList();
    musicDialog.showModal();
  });

  localMusicInput.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    let lastAddedId = null;
    for (const file of files) {
      const id = "track-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
      const cleanName = file.name.replace(/\.[^/.]+$/, "");
      await dbPut(STORE_MUSIC, {
        id,
        title: cleanName,
        fileName: file.name,
        blob: file,
        createdAt: Date.now()
      });
      lastAddedId = id;
    }

    if (lastAddedId) {
      activeTrackId = lastAddedId;
      localStorage.setItem("calm_active_track_id", activeTrackId);
      isMusicEnabled = true;
      localStorage.setItem("calm_music_enabled", "true");
      await loadAndPlayActiveTrack();
    }
    localMusicInput.value = "";
  });

  function renderTrackList() {
    musicTrackList.innerHTML = "";
    const allTracks = [BUILTIN_TRACK, ...customTracks];

    allTracks.forEach((track) => {
      const li = document.createElement("li");
      li.className = "track-item" + (track.id === activeTrackId ? " is-active" : "");

      const titleSpan = document.createElement("span");
      titleSpan.textContent = (track.id === activeTrackId ? "▶️ " : "🎵 ") + track.title;

      const actionsDiv = document.createElement("div");
      actionsDiv.className = "track-actions";

      const useBtn = document.createElement("button");
      useBtn.type = "button";
      useBtn.className = "liquid-glass-pill";
      useBtn.textContent = track.id === activeTrackId ? "Active" : "Select";
      useBtn.addEventListener("click", async () => {
        activeTrackId = track.id;
        localStorage.setItem("calm_active_track_id", activeTrackId);
        isMusicEnabled = true;
        localStorage.setItem("calm_music_enabled", "true");
        await loadAndPlayActiveTrack();
      });
      actionsDiv.appendChild(useBtn);

      if (!track.isBuiltin) {
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "liquid-glass-pill";
        delBtn.textContent = "✕";
        delBtn.addEventListener("click", async () => {
          await dbDelete(STORE_MUSIC, track.id);
          if (activeTrackId === track.id) {
            activeTrackId = BUILTIN_TRACK.id;
            localStorage.setItem("calm_active_track_id", activeTrackId);
          }
          await loadAndPlayActiveTrack();
        });
        actionsDiv.appendChild(delBtn);
      }

      li.appendChild(titleSpan);
      li.appendChild(actionsDiv);
      musicTrackList.appendChild(li);
    });
  }

  // ============================================================================
  // 5. WEB AUDIO SYNTHESIS:
  //    - Inhale: Inflating a plastic/air bag (rising air cavity + film stretch crinkles)
  //    - Exhale: Deeply relaxing warm sigh (falling soft breeze + warm harmonic pad)
  // ============================================================================
  let audioCtx = null;
  let breathChimeEnabled = true;
  let activeBreathAudioNodes = [];

  function getAudioContext() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function stopActiveBreathSound() {
    activeBreathAudioNodes.forEach((node) => {
      try {
        node.stop && node.stop();
      } catch {}
      try {
        node.disconnect && node.disconnect();
      } catch {}
    });
    activeBreathAudioNodes = [];
  }

  function playBreathPhaseSound(phase) {
    stopActiveBreathSound();
    if (!breathChimeEnabled || currentStep !== 1) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const dur = phase.duration;

    if (phase.type === "inhale" || phase.type === "inhale+") {
      const isTopOff = phase.type === "inhale+";
      const bufLen = Math.ceil(ctx.sampleRate * dur);
      const noiseBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);

      for (let i = 0; i < bufLen; i++) {
        const progress = i / bufLen;
        let sample = (Math.random() * 2 - 1) * 0.45;
        if (Math.random() < 0.0022 * (0.4 + progress)) {
          sample += (Math.random() * 2 - 1) * 1.8;
        }
        data[i] = sample;
      }

      const airSource = ctx.createBufferSource();
      airSource.buffer = noiseBuf;

      const cavityFilter = ctx.createBiquadFilter();
      cavityFilter.type = "bandpass";
      cavityFilter.Q.setValueAtTime(3.2, now);
      cavityFilter.frequency.setValueAtTime(isTopOff ? 720 : 250, now);
      cavityFilter.frequency.exponentialRampToValueAtTime(isTopOff ? 1280 : 720, now + dur);

      const crinkleFilter = ctx.createBiquadFilter();
      crinkleFilter.type = "bandpass";
      crinkleFilter.Q.setValueAtTime(4.5, now);
      crinkleFilter.frequency.setValueAtTime(isTopOff ? 3200 : 2400, now);
      crinkleFilter.frequency.exponentialRampToValueAtTime(4200, now + dur);

      const airGain = ctx.createGain();
      airGain.gain.setValueAtTime(0.002, now);
      airGain.gain.linearRampToValueAtTime(isTopOff ? 0.14 : 0.11, now + Math.min(0.25, dur * 0.25));
      airGain.gain.linearRampToValueAtTime(isTopOff ? 0.16 : 0.13, now + dur * 0.85);
      airGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

      const crinkleGain = ctx.createGain();
      crinkleGain.gain.setValueAtTime(0.001, now);
      crinkleGain.gain.linearRampToValueAtTime(0.035, now + dur * 0.5);
      crinkleGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

      const bodyOsc = ctx.createOscillator();
      const bodyGain = ctx.createGain();
      bodyOsc.type = "triangle";
      bodyOsc.frequency.setValueAtTime(isTopOff ? 210 : 125, now);
      bodyOsc.frequency.exponentialRampToValueAtTime(isTopOff ? 285 : 210, now + dur);

      bodyGain.gain.setValueAtTime(0.001, now);
      bodyGain.gain.linearRampToValueAtTime(0.032, now + dur * 0.4);
      bodyGain.gain.exponentialRampToValueAtTime(0.0008, now + dur);

      airSource.connect(cavityFilter);
      cavityFilter.connect(airGain);
      airGain.connect(ctx.destination);

      airSource.connect(crinkleFilter);
      crinkleFilter.connect(crinkleGain);
      crinkleGain.connect(ctx.destination);

      bodyOsc.connect(bodyGain);
      bodyGain.connect(ctx.destination);

      airSource.start(now);
      airSource.stop(now + dur);
      bodyOsc.start(now);
      bodyOsc.stop(now + dur);

      activeBreathAudioNodes.push(airSource, bodyOsc, airGain, crinkleGain, bodyGain);
    } else if (phase.type === "exhale") {
      const bufLen = Math.ceil(ctx.sampleRate * dur);
      const noiseBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);

      let lastOut = 0;
      for (let i = 0; i < bufLen; i++) {
        const white = Math.random() * 2 - 1;
        lastOut = (lastOut + 0.04 * white) / 1.04;
        data[i] = lastOut * 1.8;
      }

      const sighSource = ctx.createBufferSource();
      sighSource.buffer = noiseBuf;

      const lowpass = ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.setValueAtTime(480, now);
      lowpass.frequency.exponentialRampToValueAtTime(115, now + dur);

      const sighGain = ctx.createGain();
      sighGain.gain.setValueAtTime(0.002, now);
      sighGain.gain.linearRampToValueAtTime(0.09, now + 0.35);
      sighGain.gain.exponentialRampToValueAtTime(0.0008, now + dur);

      const padOsc1 = ctx.createOscillator();
      const padOsc2 = ctx.createOscillator();
      const padGain = ctx.createGain();

      padOsc1.type = "sine";
      padOsc1.frequency.setValueAtTime(216, now);
      padOsc1.frequency.linearRampToValueAtTime(210, now + dur);

      padOsc2.type = "sine";
      padOsc2.frequency.setValueAtTime(324, now);
      padOsc2.frequency.linearRampToValueAtTime(315, now + dur);

      padGain.gain.setValueAtTime(0.001, now);
      padGain.gain.linearRampToValueAtTime(0.045, now + 0.45);
      padGain.gain.exponentialRampToValueAtTime(0.0005, now + dur);

      sighSource.connect(lowpass);
      lowpass.connect(sighGain);
      sighGain.connect(ctx.destination);

      padOsc1.connect(padGain);
      padOsc2.connect(padGain);
      padGain.connect(ctx.destination);

      sighSource.start(now);
      sighSource.stop(now + dur);
      padOsc1.start(now);
      padOsc1.stop(now + dur);
      padOsc2.start(now);
      padOsc2.stop(now + dur);

      activeBreathAudioNodes.push(sighSource, padOsc1, padOsc2, sighGain, padGain);
    }
  }

  function playSingingBowlCue(freq = 432, duration = 1.2) {
    if (!breathChimeEnabled) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.06, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  function playDestroySoundEffect(mode) {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (mode === "stardust") {
      [528, 660, 792, 1056].forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(f, now + idx * 0.09);
        gain.gain.setValueAtTime(0.001, now + idx * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.07, now + idx * 0.09 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.09 + 1.1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.09);
        osc.stop(now + idx * 0.09 + 1.1);
      });
      return;
    }

    const bufferSize = ctx.sampleRate * 1.1;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (mode === "fire" ? 0.6 : 0.85);
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = mode === "fire" ? "bandpass" : "highpass";
    filter.frequency.setValueAtTime(mode === "fire" ? 420 : 900, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.05);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 1.1);
  }

  // ============================================================================
  // 6. STEP NAVIGATION
  // ============================================================================
  let currentStep = 1;
  const stepPanels = [1, 2, 3, 4].map((n) => document.getElementById(`step-panel-${n}`));
  const nextStepBtn = document.getElementById("next-step-btn");
  const calmNowBtn = document.getElementById("calm-now-btn");

  function applyStepDOMUpdate(targetStep) {
    currentStep = targetStep;
    if (currentStep !== 1) {
      stopActiveBreathSound();
    }
    stepPanels.forEach((panel, idx) => {
      panel.hidden = idx + 1 !== currentStep;
    });
    nextStepBtn.textContent = currentStep < 4 ? "Next" : "Done";
  }

  function goToStep(targetStep) {
    if (targetStep === currentStep || targetStep < 1 || targetStep > 4) return;
    const direction = targetStep > currentStep ? "forward" : "backward";
    const updateDOM = () => applyStepDOMUpdate(targetStep);

    if (!document.startViewTransition) {
      updateDOM();
      return;
    }

    try {
      document.startViewTransition({
        update: updateDOM,
        types: [direction]
      });
    } catch {
      document.startViewTransition(updateDOM);
    }
  }

  nextStepBtn.addEventListener("click", () => {
    if (currentStep < 4) {
      goToStep(currentStep + 1);
    } else {
      openVictorySummary();
    }
  });

  calmNowBtn.addEventListener("click", () => {
    openVictorySummary();
  });

  // ============================================================================
  // 7. STEP 1: 60FPS CONTINUOUS BREATHING ORB
  // ============================================================================
  const orbContainer = document.getElementById("orb-container");
  const orbPhaseText = document.getElementById("orb-phase-text");
  const orbTimerText = document.getElementById("orb-timer-text");
  const toggleChimeBtn = document.getElementById("toggle-chime-btn");
  const chimeStatusText = document.getElementById("chime-status-text");

  const MIN_SCALE = 0.48;
  const MID_SCALE = 0.90;
  const MAX_SCALE = 1.15;

  const BREATH_PATTERNS = {
    sigh: [
      { label: "Inhale", type: "inhale", duration: 2.0, startScale: MIN_SCALE, endScale: MID_SCALE },
      { label: "Inhale+", type: "inhale+", duration: 1.0, startScale: MID_SCALE, endScale: MAX_SCALE },
      { label: "Exhale", type: "exhale", duration: 5.0, startScale: MAX_SCALE, endScale: MIN_SCALE }
    ],
    "478": [
      { label: "Inhale", type: "inhale", duration: 4.0, startScale: MIN_SCALE, endScale: MAX_SCALE },
      { label: "Hold", type: "hold", duration: 7.0, startScale: MAX_SCALE, endScale: MAX_SCALE },
      { label: "Exhale", type: "exhale", duration: 8.0, startScale: MAX_SCALE, endScale: MIN_SCALE }
    ],
    box: [
      { label: "Inhale", type: "inhale", duration: 4.0, startScale: MIN_SCALE, endScale: MAX_SCALE },
      { label: "Hold", type: "hold", duration: 4.0, startScale: MAX_SCALE, endScale: MAX_SCALE },
      { label: "Exhale", type: "exhale", duration: 4.0, startScale: MAX_SCALE, endScale: MIN_SCALE },
      { label: "Hold", type: "hold", duration: 4.0, startScale: MIN_SCALE, endScale: MIN_SCALE }
    ]
  };

  let activeBreathMode = "sigh";
  let currentPhaseIdx = 0;
  let phaseStartTime = performance.now();

  function beginPhase(phaseIdx) {
    const pattern = BREATH_PATTERNS[activeBreathMode];
    currentPhaseIdx = phaseIdx % pattern.length;
    const phase = pattern[currentPhaseIdx];
    phaseStartTime = performance.now();

    orbPhaseText.textContent = phase.label;
    orbContainer.dataset.phase = phase.type;
    playBreathPhaseSound(phase);
  }

  function startBreathPattern(modeKey) {
    activeBreathMode = modeKey;
    beginPhase(0);
  }

  function animateBreathingLoop(now) {
    if (currentStep === 1) {
      const pattern = BREATH_PATTERNS[activeBreathMode];
      const phase = pattern[currentPhaseIdx];
      const elapsedSec = (now - phaseStartTime) / 1000;

      if (elapsedSec >= phase.duration) {
        beginPhase(currentPhaseIdx + 1);
      } else {
        const remaining = Math.max(0, phase.duration - elapsedSec);
        orbTimerText.textContent = remaining.toFixed(1);

        const rawProgress = Math.min(1, Math.max(0, elapsedSec / phase.duration));
        const smoothProgress =
          0.65 * rawProgress + 0.35 * (0.5 - 0.5 * Math.cos(Math.PI * rawProgress));

        const currentScale =
          phase.startScale + (phase.endScale - phase.startScale) * smoothProgress;
        const tension = Math.max(0, Math.min(1, (currentScale - MIN_SCALE) / (MAX_SCALE - MIN_SCALE)));

        orbContainer.style.setProperty("--orb-scale", currentScale.toFixed(4));
        orbContainer.style.setProperty("--orb-tension", tension.toFixed(4));
      }
    }
    requestAnimationFrame(animateBreathingLoop);
  }

  document.querySelectorAll('input[name="breath-mode"]').forEach((radio) => {
    radio.addEventListener("change", (e) => {
      if (e.target.checked) startBreathPattern(e.target.value);
    });
  });

  toggleChimeBtn.addEventListener("click", () => {
    breathChimeEnabled = !breathChimeEnabled;
    chimeStatusText.textContent = breathChimeEnabled ? "🔔" : "🔕";
    if (!breathChimeEnabled) {
      stopActiveBreathSound();
    } else {
      const phase = BREATH_PATTERNS[activeBreathMode][currentPhaseIdx];
      playBreathPhaseSound(phase);
    }
  });

  startBreathPattern("sigh");
  requestAnimationFrame(animateBreathingLoop);

  // ============================================================================
  // 8. STEP 2: SOBER MEMO & PHOTO ANCHORS
  // ============================================================================
  const photoGrid = document.getElementById("photo-grid");
  const photoUploadInput = document.getElementById("photo-upload-input");
  const quoteMainText = document.getElementById("quote-main-text");
  const nextQuoteBtn = document.getElementById("next-quote-btn");
  const pinQuoteBtn = document.getElementById("pin-quote-btn");
  const customMemoInput = document.getElementById("custom-memo-input");
  const addMemoBtn = document.getElementById("add-memo-btn");

  const DEFAULT_QUOTES = [
    '"Pause for 3 minutes now to save 3 days of regret."',
    '"Never punish your body for another person\'s mistake."',
    '"If it won\'t matter in 3 days, don\'t give it your peace today."',
    '"Calm is your true superpower."'
  ];

  const DEFAULT_SVG_PHOTOS = [
    {
      id: "default-photo-1",
      isDefault: true,
      dataUrl:
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 250'%3E%3Cdefs%3E%3ClinearGradient id='sky' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0%25' stop-color='%23041624'/%3E%3Cstop offset='65%25' stop-color='%230d4b59'/%3E%3Cstop offset='100%25' stop-color='%2314b8a6'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='400' height='250' fill='url(%23sky)'/%3E%3Ccircle cx='310' cy='60' r='22' fill='%23fef08a' fill-opacity='0.88'/%3E%3Cpath d='M0 185 Q100 160 200 185 T400 180 L400 250 L0 250 Z' fill='%23082f3a'/%3E%3Cpath d='M0 210 Q120 195 240 210 T400 205 L400 250 L0 250 Z' fill='%23041c24'/%3E%3C/svg%3E"
    }
  ];

  function getSavedQuotes() {
    try {
      const custom = JSON.parse(localStorage.getItem("calm_custom_quotes") || "[]");
      return [...custom, ...DEFAULT_QUOTES];
    } catch {
      return [...DEFAULT_QUOTES];
    }
  }

  let quoteIndex = 0;
  function renderCurrentQuote() {
    const allQuotes = getSavedQuotes();
    const pinned = localStorage.getItem("calm_pinned_quote");
    if (quoteIndex === 0 && pinned) {
      quoteMainText.textContent = pinned;
    } else {
      quoteMainText.textContent = allQuotes[quoteIndex % allQuotes.length];
    }
  }

  nextQuoteBtn.addEventListener("click", () => {
    quoteIndex += 1;
    renderCurrentQuote();
  });

  pinQuoteBtn.addEventListener("click", () => {
    localStorage.setItem("calm_pinned_quote", quoteMainText.textContent);
    quoteIndex = 0;
    renderCurrentQuote();
  });

  addMemoBtn.addEventListener("click", () => {
    const val = customMemoInput.value.trim();
    if (!val) return;
    const formatted = val.startsWith('"') ? val : `"${val}"`;
    const existing = JSON.parse(localStorage.getItem("calm_custom_quotes") || "[]");
    existing.unshift(formatted);
    localStorage.setItem("calm_custom_quotes", JSON.stringify(existing.slice(0, 20)));
    localStorage.setItem("calm_pinned_quote", formatted);
    customMemoInput.value = "";
    quoteIndex = 0;
    renderCurrentQuote();
  });

  async function renderPhotoAnchors() {
    const savedPhotos = await dbGetAll(STORE_PHOTOS);
    const listToShow = savedPhotos.length > 0 ? savedPhotos : DEFAULT_SVG_PHOTOS;
    photoGrid.innerHTML = "";

    listToShow.forEach((item) => {
      const card = document.createElement("figure");
      card.className = "photo-card";

      const img = document.createElement("img");
      img.src = item.dataUrl;
      img.alt = "";
      img.width = 360;
      img.height = 225;
      card.appendChild(img);

      if (!item.isDefault) {
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "photo-del-btn";
        delBtn.textContent = "✕";
        delBtn.addEventListener("click", async () => {
          await dbDelete(STORE_PHOTOS, item.id);
          await renderPhotoAnchors();
        });
        card.appendChild(delBtn);
      }

      photoGrid.appendChild(card);
    });
  }

  photoUploadInput.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []).slice(0, 3);
    for (const file of files) {
      const dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
      await dbPut(STORE_PHOTOS, {
        id: "photo-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
        dataUrl,
        createdAt: Date.now()
      });
    }
    photoUploadInput.value = "";
    await renderPhotoAnchors();
  });

  renderCurrentQuote();
  renderPhotoAnchors();

  // ============================================================================
  // 9. STEP 3: 5-4-3-2-1 INVERTED PYRAMID GROUNDING
  // ============================================================================
  const senseGroupList = document.getElementById("sense-group-list");

  const GROUNDING_STEPS = [
    { tier: 5, title: "👀 See 5", items: ["Light", "Color", "Texture", "Distance", "Hands"] },
    { tier: 4, title: "✋ Touch 4", items: ["Ground", "Cloth", "Phone", "Palm"] },
    { tier: 3, title: "👂 Hear 3", items: ["Music", "Breath", "Ambient"] },
    { tier: 2, title: "🌿 Smell 2", items: ["Air", "Scent"] },
    { tier: 1, title: "💛 Mind 1", items: ["I am safe and calm"] }
  ];

  function renderGroundingList() {
    senseGroupList.innerHTML = "";
    GROUNDING_STEPS.forEach((group) => {
      const tierContainer = document.createElement("div");
      tierContainer.className = "pyramid-tier";
      tierContainer.dataset.tier = String(group.tier);

      const header = document.createElement("div");
      header.className = "pyramid-header";
      header.textContent = group.title;

      const chipsRow = document.createElement("div");
      chipsRow.className = "pyramid-chips-row";

      group.items.forEach((itemText) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "sense-chip-btn";
        chip.setAttribute("aria-pressed", "false");
        chip.textContent = itemText;

        chip.addEventListener("click", () => {
          const isPressed = chip.getAttribute("aria-pressed") === "true";
          chip.setAttribute("aria-pressed", String(!isPressed));
          if (!isPressed) {
            playSingingBowlCue(528, 0.5);
          }
        });

        chipsRow.appendChild(chip);
      });

      tierContainer.appendChild(header);
      tierContainer.appendChild(chipsRow);
      senseGroupList.appendChild(tierContainer);
    });
  }

  renderGroundingList();

  // ============================================================================
  // 10. STEP 4: SHREDDER / RELEASE
  // ============================================================================
  const ventTextarea = document.getElementById("vent-textarea");
  const shredStripsContainer = document.getElementById("shred-strips-container");
  const destroyFxCanvas = document.getElementById("destroy-fx-canvas");
  const destroyTriggerBtn = document.getElementById("destroy-trigger-btn");

  function runPaperShredderEffect(text) {
    return new Promise((resolve) => {
      shredStripsContainer.innerHTML = "";
      shredStripsContainer.hidden = false;
      ventTextarea.style.opacity = "0";

      const stripCount = 14;
      for (let i = 0; i < stripCount; i++) {
        const strip = document.createElement("div");
        strip.className = "shred-strip";
        const rot = (i % 2 === 0 ? 1 : -1) * (2 + (i % 5));
        strip.style.setProperty("--strip-rot", `${rot}deg`);
        strip.style.animationDelay = `${(i % 4) * 0.04}s`;
        strip.textContent = text.slice(i * 4, i * 4 + 18) || "///";
        shredStripsContainer.appendChild(strip);
      }

      setTimeout(() => {
        shredStripsContainer.hidden = true;
        shredStripsContainer.innerHTML = "";
        ventTextarea.style.opacity = "1";
        resolve();
      }, 1150);
    });
  }

  function runCanvasParticleEffect(mode) {
    return new Promise((resolve) => {
      const rect = ventTextarea.getBoundingClientRect();
      const width = Math.max(280, Math.floor(rect.width));
      const height = Math.max(180, Math.floor(rect.height));
      destroyFxCanvas.width = width;
      destroyFxCanvas.height = height;
      destroyFxCanvas.hidden = false;
      ventTextarea.style.opacity = "0";

      const ctx = destroyFxCanvas.getContext("2d");
      const count = mode === "fire" ? 130 : 150;
      const particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: mode === "fire" ? height * (0.4 + Math.random() * 0.6) : Math.random() * height,
        vx: (Math.random() - 0.5) * (mode === "fire" ? 1.8 : 2.6),
        vy: mode === "fire" ? -(1.8 + Math.random() * 3.4) : -(0.8 + Math.random() * 2.4),
        radius: mode === "fire" ? 2.5 + Math.random() * 5.5 : 1.5 + Math.random() * 3.5,
        alpha: 0.95,
        hue: mode === "fire" ? 12 + Math.random() * 36 : 165 + Math.random() * 45
      }));

      let frame = 0;
      const maxFrames = 64;

      function tick() {
        frame += 1;
        ctx.clearRect(0, 0, width, height);
        particles.forEach((p) => {
          p.x += p.vx;
          p.y += p.vy;
          p.alpha = Math.max(0, p.alpha - 1 / maxFrames);

          ctx.beginPath();
          ctx.fillStyle = `hsla(${p.hue}, 92%, 62%, ${p.alpha})`;
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fill();
        });

        if (frame < maxFrames) {
          requestAnimationFrame(tick);
        } else {
          ctx.clearRect(0, 0, width, height);
          destroyFxCanvas.hidden = true;
          ventTextarea.style.opacity = "1";
          resolve();
        }
      }

      requestAnimationFrame(tick);
    });
  }

  destroyTriggerBtn.addEventListener("click", async () => {
    const rawText = ventTextarea.value.trim() || "///";
    const modeInput = document.querySelector('input[name="destroy-mode"]:checked');
    const mode = modeInput ? modeInput.value : "shred";

    destroyTriggerBtn.disabled = true;
    playDestroySoundEffect(mode);
    if (navigator.vibrate) {
      navigator.vibrate([60, 40, 80]);
    }

    if (mode === "shred") {
      await runPaperShredderEffect(rawText);
    } else {
      await runCanvasParticleEffect(mode);
    }

    ventTextarea.value = "";
    destroyTriggerBtn.disabled = false;
  });

  // ============================================================================
  // 11. MINIMAL COOLDOWN RECORDS
  // ============================================================================
  const victoryDialog = document.getElementById("victory-dialog");
  const saveVictoryBtn = document.getElementById("save-victory-btn");
  const openArchiveBtn = document.getElementById("open-archive-btn");
  const archiveDialog = document.getElementById("archive-dialog");
  const headerWinCount = document.getElementById("header-win-count");
  const statTotalCount = document.getElementById("stat-total-count");
  const historyList = document.getElementById("history-list");
  const clearHistoryBtn = document.getElementById("clear-history-btn");

  const HISTORY_STORAGE_KEY = "calm_cooldown_records_v1";

  function getHistoryRecords() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function openVictorySummary() {
    stopActiveBreathSound();
    ventTextarea.value = "";
    playSingingBowlCue(528, 1.4);
    victoryDialog.showModal();
  }

  saveVictoryBtn.addEventListener("click", () => {
    const selectedTagInput = document.querySelector('input[name="trigger-tag"]:checked');
    const tag = selectedTagInput ? selectedTagInput.value : "💼 Work";
    const records = getHistoryRecords();

    records.unshift({
      id: Date.now(),
      timestamp: new Date().toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }),
      tag
    });

    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(records.slice(0, 50)));
    updateArchiveUI();
    victoryDialog.close();

    senseGroupList.querySelectorAll('.sense-chip-btn[aria-pressed="true"]').forEach((btn) => {
      btn.setAttribute("aria-pressed", "false");
    });
    goToStep(1);
    beginPhase(0);
  });

  function updateArchiveUI() {
    const records = getHistoryRecords();
    headerWinCount.textContent = String(records.length);
    statTotalCount.textContent = String(records.length);

    if (records.length === 0) {
      historyList.innerHTML = `<li class="history-row"><span>No records yet</span></li>`;
      return;
    }

    historyList.innerHTML = "";
    records.slice(0, 15).forEach((r) => {
      const li = document.createElement("li");
      li.className = "history-row";
      li.innerHTML = `<span>${r.tag}</span><span>${r.timestamp}</span>`;
      historyList.appendChild(li);
    });
  }

  openArchiveBtn.addEventListener("click", () => {
    updateArchiveUI();
    archiveDialog.showModal();
  });

  clearHistoryBtn.addEventListener("click", () => {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
    updateArchiveUI();
  });

  updateArchiveUI();
  loadAndPlayActiveTrack();
})();
