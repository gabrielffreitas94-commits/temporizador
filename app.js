(() => {
  const STORAGE_KEY = "temporizador.v1.timers";

  /**
   * @typedef {Object} Timer
   * @property {string} id
   * @property {string} name
   * @property {number} elapsedMs
   * @property {boolean} isRunning
   * @property {number|null} startedAt
   * @property {boolean} archived
   * @property {string} createdAt
   */

  /** @type {Timer[]} */
  let timers = loadTimers();
  let archivedExpanded = false;
  let editingTimerId = null;
  let tickIntervalId = null;

  const addTimerForm = document.getElementById("add-timer-form");
  const timerNameInput = document.getElementById("timer-name-input");
  const timersListEl = document.getElementById("timers-list");
  const emptyStateEl = document.getElementById("empty-state");
  const totalTimeEl = document.getElementById("total-time");
  const archivedSectionEl = document.getElementById("archived-section");
  const toggleArchivedBtn = document.getElementById("toggle-archived-btn");
  const archivedToggleLabelEl = document.getElementById("archived-toggle-label");
  const archivedListEl = document.getElementById("archived-list");
  const exportJsonBtn = document.getElementById("export-json-btn");
  const exportCsvBtn = document.getElementById("export-csv-btn");

  function loadTimers() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveTimers() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(timers));
  }

  function generateId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `timer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function getElapsedMs(timer, now = Date.now()) {
    if (timer.isRunning && timer.startedAt !== null) {
      return timer.elapsedMs + Math.max(0, now - timer.startedAt);
    }
    return timer.elapsedMs;
  }

  function formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds]
      .map((unit) => String(unit).padStart(2, "0"))
      .join(":");
  }

  function parseDurationInput(rawValue) {
    const value = rawValue.trim();
    if (!value) return null;

    if (/^\d+$/.test(value)) {
      const seconds = Number(value);
      return Number.isSafeInteger(seconds) ? seconds * 1000 : null;
    }

    const parts = value.split(":");
    if (parts.length < 2 || parts.length > 3) return null;
    if (!parts.every((part) => /^\d+$/.test(part))) return null;

    const nums = parts.map(Number);
    let hours = 0;
    let minutes = 0;
    let seconds = 0;

    if (nums.length === 2) {
      [minutes, seconds] = nums;
    } else {
      [hours, minutes, seconds] = nums;
    }

    if (seconds >= 60 || (nums.length === 3 && minutes >= 60)) {
      return null;
    }

    const totalSeconds = hours * 3600 + minutes * 60 + seconds;
    return totalSeconds * 1000;
  }

  function stopTimer(timer, now = Date.now()) {
    if (!timer.isRunning) return;
    timer.elapsedMs = getElapsedMs(timer, now);
    timer.isRunning = false;
    timer.startedAt = null;
  }

  function startTimer(timer, now = Date.now()) {
    if (timer.archived || timer.isRunning) return;
    timer.isRunning = true;
    timer.startedAt = now;
  }

  function handleTimerClick(timerId) {
    const now = Date.now();
    const clicked = timers.find((t) => t.id === timerId);
    if (!clicked || clicked.archived) return;

    const wasRunning = clicked.isRunning;

    for (const timer of timers) {
      if (timer.isRunning) {
        stopTimer(timer, now);
      }
    }

    if (!wasRunning) {
      startTimer(clicked, now);
    }

    saveTimers();
    syncTicker();
    render();
  }

  function addTimer(name) {
    const trimmed = name.trim();
    const nextNumber = timers.length + 1;
    const timer = {
      id: generateId(),
      name: trimmed || `Temporizador ${nextNumber}`,
      elapsedMs: 0,
      isRunning: false,
      startedAt: null,
      archived: false,
      createdAt: new Date().toISOString(),
    };

    timers.unshift(timer);
    saveTimers();
    render();
  }

  function archiveTimer(timerId) {
    const now = Date.now();
    const timer = timers.find((t) => t.id === timerId);
    if (!timer) return;

    stopTimer(timer, now);
    if (editingTimerId === timerId) {
      editingTimerId = null;
    }
    timer.archived = true;
    saveTimers();
    syncTicker();
    render();
  }

  function startEditingTime(timerId) {
    const now = Date.now();
    const timer = timers.find((t) => t.id === timerId);
    if (!timer || timer.archived) return;

    stopTimer(timer, now);
    editingTimerId = timerId;
    saveTimers();
    syncTicker();
    render();

    const input = document.querySelector(`[data-edit-input-id="${timerId}"]`);
    if (input) {
      input.focus();
      input.select();
    }
  }

  function cancelEditingTime() {
    editingTimerId = null;
    render();
  }

  function saveEditedTime(timerId, rawValue) {
    const parsedMs = parseDurationInput(rawValue);
    if (parsedMs === null) {
      const input = document.querySelector(`[data-edit-input-id="${timerId}"]`);
      if (input) {
        input.classList.add("is-invalid");
        input.setAttribute("aria-invalid", "true");
        input.focus();
      }
      return;
    }

    const timer = timers.find((t) => t.id === timerId);
    if (!timer) return;

    timer.elapsedMs = parsedMs;
    timer.isRunning = false;
    timer.startedAt = null;
    editingTimerId = null;
    saveTimers();
    syncTicker();
    render();
  }

  function unarchiveTimer(timerId) {
    const timer = timers.find((t) => t.id === timerId);
    if (!timer) return;

    timer.archived = false;
    saveTimers();
    render();
  }

  function deleteTimer(timerId) {
    timers = timers.filter((t) => t.id !== timerId);
    saveTimers();
    syncTicker();
    render();
  }

  function createTimerCard(timer, now) {
    const card = document.createElement("div");
    card.className = "timer-card";
    if (timer.isRunning) card.classList.add("is-running");
    if (timer.archived) card.classList.add("is-archived");
    card.dataset.id = timer.id;

    const isEditing = editingTimerId === timer.id && !timer.archived;

    if (!timer.archived && !isEditing) {
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      card.addEventListener("click", () => handleTimerClick(timer.id));
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleTimerClick(timer.id);
        }
      });
    }

    const info = document.createElement("div");
    info.className = "timer-info";

    const dot = document.createElement("span");
    dot.className = "status-dot";

    const nameWrap = document.createElement("div");
    nameWrap.className = "timer-name-wrap";

    const nameEl = document.createElement("div");
    nameEl.className = "timer-name";
    nameEl.textContent = timer.name;

    const statusEl = document.createElement("div");
    statusEl.className = "timer-status-text";
    if (timer.archived) {
      statusEl.textContent = "Arquivado";
    } else if (timer.isRunning) {
      statusEl.textContent = "Contando (clique para pausar)";
    } else {
      statusEl.textContent = "Clique para iniciar";
    }

    nameWrap.append(nameEl, statusEl);
    info.append(dot, nameWrap);

    const right = document.createElement("div");
    right.className = "timer-right";

    const actions = document.createElement("div");
    actions.className = "timer-actions";

    if (isEditing) {
      const timeInput = document.createElement("input");
      timeInput.type = "text";
      timeInput.className = "time-edit-input";
      timeInput.dataset.editInputId = timer.id;
      timeInput.value = formatDuration(getElapsedMs(timer, now));
      timeInput.setAttribute("aria-label", `Editar tempo de ${timer.name} (HH:MM:SS)`);
      timeInput.title = "Formato: HH:MM:SS, MM:SS ou segundos";
      timeInput.addEventListener("click", (event) => event.stopPropagation());
      timeInput.addEventListener("input", () => {
        timeInput.classList.remove("is-invalid");
        timeInput.removeAttribute("aria-invalid");
      });
      timeInput.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          saveEditedTime(timer.id, timeInput.value);
        } else if (event.key === "Escape") {
          event.preventDefault();
          cancelEditingTime();
        }
      });

      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "btn btn-primary btn-sm";
      saveBtn.textContent = "Salvar";
      saveBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        saveEditedTime(timer.id, timeInput.value);
      });

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "btn btn-ghost";
      cancelBtn.textContent = "Cancelar";
      cancelBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        cancelEditingTime();
      });

      actions.append(saveBtn, cancelBtn);
      right.append(timeInput, actions);
    } else {
      const elapsedEl = document.createElement("span");
      elapsedEl.className = "timer-elapsed";
      elapsedEl.dataset.elapsedId = timer.id;
      elapsedEl.textContent = formatDuration(getElapsedMs(timer, now));

      if (!timer.archived) {
        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "btn btn-ghost";
        editBtn.textContent = "Editar";
        editBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          startEditingTime(timer.id);
        });

        const archiveBtn = document.createElement("button");
        archiveBtn.type = "button";
        archiveBtn.className = "btn btn-ghost";
        archiveBtn.textContent = "Arquivar";
        archiveBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          archiveTimer(timer.id);
        });
        actions.append(editBtn, archiveBtn);
      } else {
        const restoreBtn = document.createElement("button");
        restoreBtn.type = "button";
        restoreBtn.className = "btn btn-ghost";
        restoreBtn.textContent = "Restaurar";
        restoreBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          unarchiveTimer(timer.id);
        });

        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "btn btn-ghost btn-danger-ghost";
        deleteBtn.textContent = "Excluir";
        deleteBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          deleteTimer(timer.id);
        });

        actions.append(restoreBtn, deleteBtn);
      }

      right.append(elapsedEl, actions);
    }

    card.append(info, right);
    return card;
  }

  function updateDisplays() {
    const now = Date.now();
    let totalActiveMs = 0;

    for (const timer of timers) {
      const elapsed = getElapsedMs(timer, now);
      if (!timer.archived) {
        totalActiveMs += elapsed;
      }
      const el = document.querySelector(`[data-elapsed-id="${timer.id}"]`);
      if (el) {
        el.textContent = formatDuration(elapsed);
      }
    }

    totalTimeEl.textContent = `Total: ${formatDuration(totalActiveMs)}`;
  }

  function syncTicker() {
    const hasRunning = timers.some((t) => t.isRunning && !t.archived);
    if (hasRunning && tickIntervalId === null) {
      tickIntervalId = window.setInterval(updateDisplays, 250);
    } else if (!hasRunning && tickIntervalId !== null) {
      window.clearInterval(tickIntervalId);
      tickIntervalId = null;
    }
  }

  function render() {
    const now = Date.now();
    const activeTimers = timers.filter((t) => !t.archived);
    const archivedTimers = timers.filter((t) => t.archived);

    timersListEl.innerHTML = "";
    for (const timer of activeTimers) {
      timersListEl.appendChild(createTimerCard(timer, now));
    }
    emptyStateEl.hidden = activeTimers.length > 0;

    archivedSectionEl.hidden = archivedTimers.length === 0;
    archivedToggleLabelEl.textContent = `Arquivados (${archivedTimers.length})`;
    toggleArchivedBtn.setAttribute("aria-expanded", String(archivedExpanded));
    archivedListEl.hidden = !archivedExpanded;

    archivedListEl.innerHTML = "";
    if (archivedExpanded) {
      for (const timer of archivedTimers) {
        archivedListEl.appendChild(createTimerCard(timer, now));
      }
    }

    updateDisplays();
  }

  function buildExportRows() {
    const now = Date.now();
    return timers.map((timer) => {
      const elapsedMs = getElapsedMs(timer, now);
      return {
        id: timer.id,
        nome: timer.name,
        tempo_ms: elapsedMs,
        tempo_formatado: formatDuration(elapsedMs),
        em_execucao: timer.isRunning,
        arquivado: timer.archived,
        criado_em: timer.createdAt,
      };
    });
  }

  function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function escapeCsvCell(value) {
    const str = String(value ?? "");
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  function exportJson() {
    const payload = {
      exportado_em: new Date().toISOString(),
      temporizadores: buildExportRows(),
    };
    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadFile(
      `temporizadores-${dateStamp}.json`,
      JSON.stringify(payload, null, 2),
      "application/json;charset=utf-8"
    );
  }

  function exportCsv() {
    const rows = buildExportRows();
    const headers = [
      "id",
      "nome",
      "tempo_ms",
      "tempo_formatado",
      "em_execucao",
      "arquivado",
      "criado_em",
    ];
    const lines = [
      headers.join(","),
      ...rows.map((row) => headers.map((key) => escapeCsvCell(row[key])).join(",")),
    ];
    const dateStamp = new Date().toISOString().slice(0, 10);
    // UTF-8 BOM para abrir corretamente com acentos no Excel
    downloadFile(
      `temporizadores-${dateStamp}.csv`,
      `\uFEFF${lines.join("\r\n")}`,
      "text/csv;charset=utf-8"
    );
  }

  addTimerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addTimer(timerNameInput.value);
    timerNameInput.value = "";
    timerNameInput.focus();
  });

  toggleArchivedBtn.addEventListener("click", () => {
    archivedExpanded = !archivedExpanded;
    render();
  });

  exportJsonBtn.addEventListener("click", exportJson);
  exportCsvBtn.addEventListener("click", exportCsv);

  syncTicker();
  render();
})();
