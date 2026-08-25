(function () {
  "use strict";

  const STORAGE_KEY = "pourover.state.v1";
  const RING_RADIUS = 108;
  const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
  const PRE_COUNTDOWN_SECONDS = 3;

  const els = {
    recipeList: document.getElementById("recipe-list"),

    screenHome: document.getElementById("screen-home"),
    screenTune: document.getElementById("screen-tune"),
    screenTimer: document.getElementById("screen-timer"),
    screenDone: document.getElementById("screen-done"),

    tuneBack: document.getElementById("tune-back"),
    tuneTitle: document.getElementById("tune-title"),
    sizeRow: document.getElementById("size-row"),
    doseMinus: document.getElementById("dose-minus"),
    dosePlus: document.getElementById("dose-plus"),
    doseValue: document.getElementById("dose-value"),
    totalCoffee: document.getElementById("total-coffee"),
    totalWater: document.getElementById("total-water"),
    totalGrind: document.getElementById("total-grind"),
    dialinSection: document.getElementById("dialin-section"),
    balanceSeg: document.getElementById("balance-seg"),
    strengthSeg: document.getElementById("strength-seg"),
    pourChart: document.getElementById("pour-chart"),
    stepList: document.getElementById("step-list"),
    startBtn: document.getElementById("start-btn"),

    timerClose: document.getElementById("timer-close"),
    timerRestart: document.getElementById("timer-restart"),
    timerRecipeName: document.getElementById("timer-recipe-name"),
    timerProgressLabel: document.getElementById("timer-progress-label"),
    ringProgress: document.getElementById("ring-progress"),
    timerClock: document.getElementById("timer-clock"),
    instructionMain: document.getElementById("instruction-main"),
    instructionNote: document.getElementById("instruction-note"),
    instructionNext: document.getElementById("instruction-next"),
    timerControls: document.querySelector(".timer-controls"),
    skipBack: document.getElementById("skip-back"),
    playPause: document.getElementById("play-pause"),
    skipFwd: document.getElementById("skip-fwd"),

    doneTime: document.getElementById("done-time"),
    doneBtn: document.getElementById("done-btn"),
  };

  els.ringProgress.style.strokeDasharray = String(RING_CIRCUMFERENCE);

  // ---------- persisted preferences ----------
  function loadPrefs() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      return JSON.parse(raw);
    } catch (e) {
      return {};
    }
  }
  function savePrefs(patch) {
    const prefs = Object.assign(loadPrefs(), patch);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch (e) {
      /* storage unavailable, ignore */
    }
  }

  // ---------- analytics ----------
  // Fire-and-forget counters (see src/worker.js). Silently does nothing
  // where the endpoint isn't available, e.g. local dev.
  function trackEvent(event, recipeId) {
    try {
      const payload = JSON.stringify({ event, recipe: recipeId });
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/track", new Blob([payload], { type: "application/json" }));
      } else {
        fetch("/api/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      }
    } catch (e) {
      /* tracking unavailable, ignore */
    }
  }

  // ---------- app state ----------
  const state = {
    recipeId: null,
    doseGrams: null,
    balanceId: "even",
    strengthId: "medium",
    scaled: null, // scaleRecipe() output
    stepIndex: 0,
    running: false,
    stepStartedAt: 0, // performance.now() ms when current step started
    stepElapsedAtPause: 0, // seconds already elapsed in current step when paused
    rafId: null,
    countingDown: false,
    countdownStartedAt: 0,
    countdownLastTick: -1,
  };

  function fmtClock(totalSeconds) {
    const s = Math.max(0, Math.round(totalSeconds));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m + ":" + String(r).padStart(2, "0");
  }

  function showScreen(el) {
    [els.screenHome, els.screenTune, els.screenTimer, els.screenDone].forEach((s) =>
      s.classList.remove("active")
    );
    el.classList.add("active");
  }

  // ---------- HOME ----------
  function renderHome() {
    els.recipeList.innerHTML = "";
    RECIPES.forEach((r) => {
      const card = document.createElement("button");
      card.className = "recipe-card";
      card.innerHTML =
        '<h3>' + r.name + '</h3>' +
        '<p class="author">' + r.author + '</p>' +
        '<p class="desc">' + r.description + '</p>' +
        '<div class="meta"><span><b>' + r.sizes.medium + 'g</b> coffee</span>' +
        '<span><b>' + Math.round(r.sizes.medium * r.ratio) + 'g</b> water</span>' +
        '<span><b>' + r.grind + '</b></span></div>';
      card.addEventListener("click", () => openTune(r.id));
      els.recipeList.appendChild(card);
    });
  }

  // ---------- TUNE ----------
  function openTune(recipeId) {
    const prefs = loadPrefs();
    const recipe = getRecipe(recipeId);
    state.recipeId = recipeId;
    trackEvent("picked", recipeId);
    state.doseGrams = prefs.recipeId === recipeId && prefs.doseGrams
      ? prefs.doseGrams
      : recipe.sizes.medium;
    state.balanceId = prefs.recipeId === recipeId && prefs.balanceId ? prefs.balanceId : "even";
    state.strengthId = prefs.recipeId === recipeId && prefs.strengthId ? prefs.strengthId : "medium";

    els.tuneTitle.textContent = recipe.name;
    els.dialinSection.classList.toggle("hidden", recipe.id !== "foursix");

    els.sizeRow.innerHTML = "";
    SIZE_PRESETS.forEach((preset) => {
      const chip = document.createElement("button");
      chip.className = "size-chip";
      chip.textContent = preset.label;
      chip.dataset.presetId = preset.id;
      chip.addEventListener("click", () => {
        setDose(presetDoseGrams(recipe, preset));
      });
      els.sizeRow.appendChild(chip);
    });

    if (recipe.id === "foursix") {
      renderSegmented(els.balanceSeg, BALANCE_OPTIONS, state.balanceId, (id) => {
        state.balanceId = id;
        renderTune();
      });
      renderSegmented(els.strengthSeg, STRENGTH_OPTIONS, state.strengthId, (id) => {
        state.strengthId = id;
        renderTune();
      });
    }

    renderTune();
    showScreen(els.screenTune);
  }

  function renderSegmented(container, options, selectedId, onSelect) {
    container.innerHTML = "";
    options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.className = "segmented-btn";
      btn.textContent = opt.label;
      btn.classList.toggle("selected", opt.id === selectedId);
      btn.addEventListener("click", () => onSelect(opt.id));
      container.appendChild(btn);
    });
  }

  function presetDoseGrams(recipe, preset) {
    return recipe.sizes[preset.id];
  }

  function setDose(grams) {
    state.doseGrams = Math.min(DOSE_MAX, Math.max(DOSE_MIN, Math.round(grams)));
    renderTune();
  }

  function renderTune() {
    const recipe = getRecipe(state.recipeId);
    const scaled = scaleRecipe(recipe, state.doseGrams, state.balanceId, state.strengthId);
    state.scaled = scaled;

    els.doseValue.textContent = state.doseGrams;
    els.totalCoffee.textContent = state.doseGrams + " g";
    els.totalWater.textContent = scaled.totalWater + " g";
    els.totalGrind.textContent = recipe.grind;

    // highlight matching size chip, if any
    const chips = els.sizeRow.querySelectorAll(".size-chip");
    chips.forEach((chip) => {
      const preset = SIZE_PRESETS.find((p) => p.id === chip.dataset.presetId);
      chip.classList.toggle("selected", presetDoseGrams(recipe, preset) === state.doseGrams);
    });

    if (recipe.id === "foursix") {
      renderSegmented(els.balanceSeg, BALANCE_OPTIONS, state.balanceId, (id) => {
        state.balanceId = id;
        renderTune();
      });
      renderSegmented(els.strengthSeg, STRENGTH_OPTIONS, state.strengthId, (id) => {
        state.strengthId = id;
        renderTune();
      });
      renderPourChart(scaled.steps, scaled.totalWater);
    }

    els.stepList.innerHTML = "";
    scaled.steps.forEach((step) => {
      const row = document.createElement("div");
      row.className = "step-row";
      row.innerHTML =
        '<span class="step-time">' + fmtClock(step.atSeconds) + '</span>' +
        '<span class="step-note">' + step.note + '</span>' +
        '<span class="step-amount">+' + step.pourAmount + 'g &rarr; ' + step.totalWeight + 'g</span>';
      els.stepList.appendChild(row);
    });
  }

  // Largest a single pour can ever be, as a fraction of total water: Light
  // strength splits the remaining 60% into 2 pours of 30% each — bigger than
  // any taste-phase pour (at most 140/240 * 40% = 23.3%). Bars are scaled
  // against this fixed reference (not each chart's own max) so height always
  // reflects real grams, and changes are visible when switching settings.
  const MAX_SINGLE_POUR_FRACTION = 0.3;

  function renderPourChart(steps, totalWater) {
    els.pourChart.innerHTML = "";
    const maxAmount = totalWater * MAX_SINGLE_POUR_FRACTION;
    steps.forEach((step, i) => {
      const wrap = document.createElement("div");
      wrap.className = "pour-bar-wrap";
      const heightPct = Math.max(8, Math.min(100, (step.pourAmount / maxAmount) * 100));
      const phaseClass = step.phase === "taste" ? "phase-taste" : "phase-strength";
      wrap.innerHTML =
        '<span class="pour-bar-amount">' + step.pourAmount + 'g</span>' +
        '<div class="pour-bar ' + phaseClass + '" style="height:' + heightPct + '%"></div>' +
        '<span class="pour-bar-index">' + (i + 1) + '</span>';
      els.pourChart.appendChild(wrap);
    });
  }

  els.doseMinus.addEventListener("click", () => setDose(state.doseGrams - 1));
  els.dosePlus.addEventListener("click", () => setDose(state.doseGrams + 1));
  els.tuneBack.addEventListener("click", () => showScreen(els.screenHome));
  els.startBtn.addEventListener("click", () => {
    savePrefs({
      recipeId: state.recipeId,
      doseGrams: state.doseGrams,
      balanceId: state.balanceId,
      strengthId: state.strengthId,
    });
    beginCountdown();
  });

  // ---------- wake lock ----------
  // Requires a secure context (HTTPS or localhost).
  let wakeLock = null;

  async function requestWakeLock() {
    if (!("wakeLock" in navigator)) return;
    try {
      wakeLock = await navigator.wakeLock.request("screen");
    } catch (e) {
      /* unsupported/denied, ignore */
    }
  }
  function releaseWakeLock() {
    if (wakeLock) {
      wakeLock.release().catch(() => {});
      wakeLock = null;
    }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && (state.running || state.countingDown)) {
      requestWakeLock();
    }
  });

  // ---------- TIMER ----------
  function clearTimers() {
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }
  }

  function beginCountdown() {
    clearTimers();
    state.stepIndex = 0;
    state.countingDown = true;
    state.countdownStartedAt = performance.now();
    state.countdownLastTick = -1;
    els.timerRecipeName.textContent = state.scaled.name;
    els.timerControls.classList.add("controls-hidden");
    showScreen(els.screenTimer);
    requestWakeLock();
    countdownTick();
  }

  function countdownTick() {
    const elapsed = (performance.now() - state.countdownStartedAt) / 1000;
    const remaining = PRE_COUNTDOWN_SECONDS - elapsed;
    const firstStep = currentStep();

    els.timerProgressLabel.textContent = "Get Ready";
    els.timerClock.textContent = String(Math.max(1, Math.ceil(remaining)));
    const frac = Math.min(1, Math.max(0, elapsed / PRE_COUNTDOWN_SECONDS));
    els.ringProgress.style.strokeDashoffset = String(RING_CIRCUMFERENCE * frac);
    els.instructionMain.textContent = "Get Ready";
    els.instructionNote.textContent = firstStep.note;
    els.instructionNext.textContent = "First pour: " + firstStep.totalWeight + "g total";

    const wholeSecondsElapsed = Math.floor(elapsed);
    if (wholeSecondsElapsed !== state.countdownLastTick) {
      state.countdownLastTick = wholeSecondsElapsed;
      playTick();
    }

    if (remaining <= 0) {
      state.countingDown = false;
      els.timerControls.classList.remove("controls-hidden");
      startTimer();
      return;
    }

    state.rafId = requestAnimationFrame(countdownTick);
  }

  function startTimer() {
    state.stepIndex = 0;
    state.stepElapsedAtPause = 0;
    state.running = true;
    state.stepStartedAt = performance.now();
    els.timerRecipeName.textContent = state.scaled.name;
    showScreen(els.screenTimer);
    setPlayPauseIcon();
    tick();
  }

  function currentStep() {
    return state.scaled.steps[state.stepIndex];
  }

  function stepElapsedSeconds() {
    if (!state.running) return state.stepElapsedAtPause;
    return state.stepElapsedAtPause + (performance.now() - state.stepStartedAt) / 1000;
  }

  function renderTimerFrame() {
    const step = currentStep();
    const elapsed = stepElapsedSeconds();
    const remaining = step.durationSeconds - elapsed;

    els.timerProgressLabel.textContent =
      "Step " + (state.stepIndex + 1) + " of " + state.scaled.steps.length;
    els.timerClock.textContent = fmtClock(remaining);

    const frac = Math.min(1, Math.max(0, elapsed / step.durationSeconds));
    els.ringProgress.style.strokeDashoffset = String(RING_CIRCUMFERENCE * frac);

    els.instructionMain.innerHTML =
      "Pour to <span class=\"instruction-grams\">" + step.totalWeight + "g</span> total";
    els.instructionNote.textContent = step.note;

    const next = state.scaled.steps[state.stepIndex + 1];
    els.instructionNext.textContent = next
      ? "Next: pour to " + next.totalWeight + "g total"
      : "Final step — let it drain";

    return remaining;
  }

  function tick() {
    const remaining = renderTimerFrame();

    if (remaining <= 0) {
      advanceStep();
      return;
    }

    if (state.running) {
      state.rafId = requestAnimationFrame(tick);
    }
  }

  function advanceStep() {
    const isLast = state.stepIndex >= state.scaled.steps.length - 1;
    if (isLast) {
      finishBrew();
      return;
    }
    alertStepChange();
    state.stepIndex += 1;
    state.stepElapsedAtPause = 0;
    state.stepStartedAt = performance.now();
    if (state.running) {
      state.rafId = requestAnimationFrame(tick);
    } else {
      renderTimerFrame();
    }
  }

  function finishBrew() {
    alertStepChange();
    cancelAnimationFrame(state.rafId);
    state.running = false;
    releaseWakeLock();
    trackEvent("completed", state.recipeId);
    els.doneTime.textContent = "Total time " + fmtClock(state.scaled.totalEstimateSeconds);
    showScreen(els.screenDone);
  }

  function setPlayPauseIcon() {
    els.playPause.innerHTML = state.running
      ? "<span class=\"pause-icon\">&#10074; &#10074;</span>"
      : "&#9654;";
    els.playPause.setAttribute("aria-label", state.running ? "Pause" : "Play");
  }

  function togglePlayPause() {
    if (state.countingDown) return;
    if (state.running) {
      state.stepElapsedAtPause = stepElapsedSeconds();
      state.running = false;
      cancelAnimationFrame(state.rafId);
    } else {
      state.stepStartedAt = performance.now();
      state.running = true;
      state.rafId = requestAnimationFrame(tick);
    }
    setPlayPauseIcon();
  }

  function jumpToStep(index) {
    if (state.countingDown) return;
    const clamped = Math.min(Math.max(index, 0), state.scaled.steps.length - 1);
    state.stepIndex = clamped;
    state.stepElapsedAtPause = 0;
    state.stepStartedAt = performance.now();
    renderTimerFrame();
    if (state.running) {
      cancelAnimationFrame(state.rafId);
      state.rafId = requestAnimationFrame(tick);
    }
  }

  function restartTimer() {
    beginCountdown();
  }

  els.playPause.addEventListener("click", togglePlayPause);
  els.skipBack.addEventListener("click", () => jumpToStep(state.stepIndex - 1));
  els.skipFwd.addEventListener("click", () => jumpToStep(state.stepIndex + 1));
  els.timerRestart.addEventListener("click", restartTimer);
  els.timerClose.addEventListener("click", () => {
    clearTimers();
    state.running = false;
    state.countingDown = false;
    releaseWakeLock();
    els.timerControls.classList.remove("controls-hidden");
    showScreen(els.screenTune);
  });
  els.doneBtn.addEventListener("click", () => showScreen(els.screenHome));

  // ---------- alerts: sound ----------
  let audioCtx = null;
  function getAudioCtx() {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    // WebKit (Safari, and every iOS browser under it) can create a context
    // in "suspended" state even from within a user gesture; resume() is a
    // harmless no-op once it's already running.
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }
  function playChime() {
    try {
      audioCtx = getAudioCtx();
      const now = audioCtx.currentTime;
      [880, 1320].forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.18, now + 0.02 + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35 + i * 0.12);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(now + i * 0.12);
        osc.stop(now + 0.4 + i * 0.12);
      });
    } catch (e) {
      /* audio unavailable, ignore */
    }
  }
  function playTick() {
    try {
      audioCtx = getAudioCtx();
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = 660;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.16);
    } catch (e) {
      /* audio unavailable, ignore */
    }
  }
  function alertStepChange() {
    playChime();
  }

  // ---------- init ----------
  renderHome();
  showScreen(els.screenHome);
})();
