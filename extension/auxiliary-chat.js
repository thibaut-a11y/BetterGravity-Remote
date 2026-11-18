// ==UserScript==
// @name         Antigravity Auxiliary Chat (Side Question Drawer)
// @namespace    https://antigravity.google.com/
// @version      1.0.0
// @description  Chat auxiliaire à droite (façon ChatGPT) + onglet "Poser une question" à côté de "Quote" lors de la sélection de texte. Compatible Trusted Types (Antigravity Remote & Desktop).
// @match        https://antigravity.google.com/*
// @match        https://*.antigravity.google/*
// @match        https://*.usercontent.goog/*
// @match        http://localhost:*/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  if (typeof window === "undefined") return;
  // Skip Google Auth iframes; allow the Antigravity app iframe (*.usercontent.goog)
  try {
    if (location.hostname === "accounts.google.com") return;
  } catch {
    return;
  }

  // Prevent multiple injections across scripts, frames, and isolated extension contexts
  if (window.__agAuxiliaryChatLoaded) return;
  if (document.documentElement && document.documentElement.dataset && document.documentElement.dataset.agAuxLoaded === "true") return;
  window.__agAuxiliaryChatLoaded = true;
  if (document.documentElement && document.documentElement.dataset) {
    document.documentElement.dataset.agAuxLoaded = "true";
  }

  const STORAGE_KEY = "ag-auxiliary-chat-v2";
  const SVG_NS = "http://www.w3.org/2000/svg";

  /* ── State & Preferences ─────────────────────────────────────────────────── */
  const defaultState = {
    open: false,
    width: 410,
    threadsByConvo: {} // { [convoKey]: { auxCascadeId, excerpt, excerptSent, messages: [{ role, text, timestamp }] } }
  };

  let state = { ...defaultState };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        state = {
          ...defaultState,
          ...parsed,
          threadsByConvo: parsed.threadsByConvo && typeof parsed.threadsByConvo === "object" ? parsed.threadsByConvo : {}
        };
      }
    }
  } catch {}

  function saveState() {
    try {
      // Keep at most 20 recent conversation threads in localStorage
      const keys = Object.keys(state.threadsByConvo || {});
      if (keys.length > 25) {
        const trimmed = {};
        for (const k of keys.slice(-20)) {
          trimmed[k] = state.threadsByConvo[k];
        }
        state.threadsByConvo = trimmed;
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }

  /* ── Trusted-Types Safe DOM Builders (Zero innerHTML) ────────────────────── */
  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "className") {
        el.className = String(v);
      } else if (k === "style" && typeof v === "object") {
        Object.assign(el.style, v);
      } else if (k.startsWith("on") && typeof v === "function") {
        const eventName = k.slice(2).toLowerCase();
        el.addEventListener(eventName, v);
      } else if (k === "dataset" && typeof v === "object") {
        for (const [dk, dv] of Object.entries(v)) {
          if (dv !== undefined && dv !== null) el.dataset[dk] = String(dv);
        }
      } else {
        el.setAttribute(k, v === true ? "" : String(v));
      }
    }
    for (const child of children.flat()) {
      if (child === undefined || child === null || child === false) continue;
      if (child instanceof Node) {
        el.appendChild(child);
      } else {
        el.appendChild(document.createTextNode(String(child)));
      }
    }
    return el;
  }

  function svgIcon(viewBox, paths, size = 15, className = "") {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", viewBox);
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.setAttribute("fill", "currentColor");
    svg.setAttribute("aria-hidden", "true");
    if (className) svg.setAttribute("class", className);
    for (const d of Array.isArray(paths) ? paths : [paths]) {
      const p = document.createElementNS(SVG_NS, "path");
      p.setAttribute("d", d);
      svg.appendChild(p);
    }
    return svg;
  }

  // Icons (Material Symbols / Lucide paths)
  const ICON_CHAT_QUESTION = "M240-400h320v-80H240v80Zm0-120h480v-80H240v80Zm0-120h480v-80H240v80ZM80-80v-720q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H240L80-80Zm126-240h594v-480H160v525l46-45Zm-46 0v-480 480Z";
  const ICON_SPARKLE = "M480-80q0-139-54.5-246.5T268-501q103-67 157.5-174.5T480-920q0 139 54.5 246.5T692-501q-103 67-157.5 174.5T480-80Z";
  const ICON_SEND = "M120-160v-240l320-80-320-80v-240l760 320-760 320Z";
  const ICON_CLOSE = "m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z";
  const ICON_PLUS = "M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z";
  const ICON_SETTINGS = "m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80H370Zm112-260q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Z";
  const ICON_COPY = "M360-240q-33 0-56.5-23.5T280-320v-480q0-33 23.5-56.5T360-880h360q33 0 56.5 23.5T800-800v480q0 33-23.5 56.5T720-240H360Zm0-80h360v-480H360v480ZM200-80q-33 0-56.5-23.5T120-160v-560h80v560h440v80H200Z";
  const ICON_QUOTE = "M220-240q-25 0-42.5-17.5T160-300v-180q0-88 55-154t145-86l20 60q-66 18-103 62t-37 98h80q25 0 42.5 17.5T380-440v140q0 25-17.5 42.5T320-240H220Zm360 0q-25 0-42.5-17.5T520-300v-180q0-88 55-154t145-86l20 60q-66 18-103 62t-37 98h80q25 0 42.5 17.5T740-440v140q0 25-17.5 42.5T680-240H580Z";
  const ICON_STOP = "M240-240v-480h480v480H240Z";
  const ICON_MIC = "M480-400q-50 0-85-35t-35-85v-240q0-50 35-85t85-35q50 0 85 35t35 85v240q0 50-35 85t-85 35Zm0-240Zm-40 520v-123q-104-14-172-93t-68-184h80q0 83 58.5 141.5T480-320q83 0 141.5-58.5T680-520h80q0 105-68 184t-172 93v123h-80Zm40-360q17 0 28.5-11.5T520-520v-240q0-17-11.5-28.5T480-800q-17 0-28.5 11.5T440-760v240q0 17 11.5 28.5T480-480Z";

  /* ── React Fiber & Antigravity Service Inspection ────────────────────────── */
  function getFiber(node) {
    if (!node) return null;
    const keys = Object.keys(node);
    const key = keys.find((k) => k.startsWith("__reactFiber"));
    const fiber = key ? node[key] : null;
    const propsKey = keys.find((k) => k.startsWith("__reactProps"));
    if (propsKey && fiber?.alternate?.memoizedProps === node[propsKey]) {
      return fiber.alternate;
    }
    return fiber;
  }

  const GEMINI_38_FLASH_HIGH = 353; // I.Model.GOOGLE_GEMINI_RIFTRUNNER_THINKING_HIGH

  function detectActiveModel() {
    // 1. Try to inspect model-selector-trigger fiber
    try {
      const trigger = document.querySelector('[data-testid="model-selector-trigger"]');
      if (trigger) {
        const key = Object.keys(trigger).find((k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"));
        if (key) {
          let fiber = trigger[key];
          for (let i = 0; fiber && i < 25; i += 1, fiber = fiber.return) {
            const props = fiber.memoizedProps;
            if (props?.selectedModel?.value) {
              return props.selectedModel;
            }
            let dep = fiber.dependencies?.firstContext;
            for (let j = 0; dep && j < 25; j += 1, dep = dep.next) {
              if (dep.memoizedValue?.selectedModel?.value) {
                return dep.memoizedValue.selectedModel;
              }
            }
          }
        }
      }
    } catch {}

    // 2. Try to inspect conversation-view fiber
    try {
      const convo = document.querySelector('[data-testid="conversation-view"]');
      if (convo) {
        const key = Object.keys(convo).find((k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"));
        if (key) {
          let fiber = convo[key];
          for (let i = 0; fiber && i < 35; i += 1, fiber = fiber.return) {
            const props = fiber.memoizedProps;
            if (props?.cascadeContext?.state?.selectedModel?.value) {
              return props.cascadeContext.state.selectedModel;
            }
            let dep = fiber.dependencies?.firstContext;
            for (let j = 0; dep && j < 35; j += 1, dep = dep.next) {
              if (dep.memoizedValue?.cascadeContext?.state?.selectedModel?.value) {
                return dep.memoizedValue.cascadeContext.state.selectedModel;
              }
              if (dep.memoizedValue?.selectedModel?.value) {
                return dep.memoizedValue.selectedModel;
              }
            }
          }
        }
      }
    } catch {}

    // 3. Fallback / default strictly to Gemini 3.8 Flash (High)
    return {
      label: "Gemini 3.8 Flash (High)",
      value: GEMINI_38_FLASH_HIGH
    };
  }

  function findAgentService() {
    const anchors = [
      document.querySelector('[data-testid="conversation-view"]'),
      document.querySelector('[data-testid="conversation-row-sidebar"]'),
      document.querySelector('[data-testid="agent-input-box"]'),
      document.body
    ];
    for (const anchor of anchors) {
      if (!anchor) continue;
      let fiber = getFiber(anchor);
      for (let depth = 0; fiber && depth < 45; depth += 1, fiber = fiber.return) {
        const svc = fiber.memoizedProps?.agentService || fiber.memoizedProps?.value?.agentService;
        if (svc && typeof svc.startCascade === "function") return svc;
        let dep = fiber.dependencies?.firstContext;
        for (let i = 0; dep && i < 35; i += 1, dep = dep.next) {
          if (typeof dep.memoizedValue?.startCascade === "function") return dep.memoizedValue;
          if (typeof dep.memoizedValue?.agentService?.startCascade === "function") {
            return dep.memoizedValue.agentService;
          }
        }
      }
    }
    return null;
  }

  function getSelectionTextFromPopupFiber(popupNode) {
    let fiber = getFiber(popupNode);
    for (let depth = 0; fiber && depth < 25; depth += 1, fiber = fiber.return) {
      const sel = fiber.memoizedProps?.selection || fiber.memoizedProps?.value?.selection;
      if (sel && typeof sel.text === "string" && sel.text.trim()) {
        return sel.text.trim();
      }
    }
    return "";
  }

  function currentConversationId() {
    const view = document.querySelector('[data-testid="conversation-view"]');
    const id = view?.getAttribute("data-cascade-id") ?? "";
    if (id && id !== "conversation") return id;
    const match = window.location?.pathname?.match(/\/c\/([a-f0-9-]+)/i);
    return match ? match[1] : "";
  }

  function currentThreadKey() {
    return currentConversationId() || "global-default";
  }

  function getActiveThread() {
    const key = currentThreadKey();
    if (!state.threadsByConvo[key]) {
      state.threadsByConvo[key] = {
        auxCascadeId: null,
        parentCascadeId: currentConversationId() || null,
        excerpt: "",
        lastSentExcerpt: "",
        messages: []
      };
    }
    return state.threadsByConvo[key];
  }

  /* ── Safe Markdown & KaTeX to DOM Renderer (Zero innerHTML) ──────────────── */
  function getKatex() {
    if (typeof window !== "undefined" && window.katex) return window.katex;
    if (typeof globalThis !== "undefined" && globalThis.katex) return globalThis.katex;
    if (typeof self !== "undefined" && self.katex) return self.katex;
    return null;
  }

  function renderMath(tex, isDisplay) {
    const el = document.createElement("span");
    el.className = isDisplay ? "ag-aux-math-block katex-display" : "ag-aux-math-inline katex-inline";
    const cleaned = (tex || "").trim();
    if (!cleaned) return el;

    const katex = getKatex();
    if (katex && typeof katex.render === "function") {
      try {
        katex.render(cleaned, el, {
          displayMode: isDisplay,
          throwOnError: false,
          output: "htmlAndMathml"
        });
        return el;
      } catch (err) {
        console.warn("[ag-aux] KaTeX render error:", err);
      }
    }

    // Fallback if KaTeX is not loaded yet or throws error
    el.textContent = isDisplay ? `$$ ${cleaned} $$` : `$${cleaned}$`;
    el.dataset.pendingMath = isDisplay ? "display" : "inline";
    el.dataset.tex = cleaned;
    el.style.fontFamily = "KaTeX_Math, KaTeX_Main, 'Times New Roman', Cambria Math, serif";
    el.style.color = "var(--primary, #cba6f7)";

    // Retry once KaTeX becomes available
    if (!katex) {
      setTimeout(() => {
        const k = getKatex();
        if (k && typeof k.render === "function" && el.dataset.pendingMath) {
          try {
            while (el.firstChild) el.removeChild(el.firstChild);
            k.render(cleaned, el, {
              displayMode: isDisplay,
              throwOnError: false,
              output: "htmlAndMathml"
            });
            delete el.dataset.pendingMath;
            delete el.dataset.tex;
          } catch {}
        }
      }, 500);
    }

    return el;
  }

  function renderInlineMarkdown(text) {
    const frag = document.createDocumentFragment();
    // Pattern matches:
    // 1: $$ display math $$
    // 2: \[ display math \]
    // 3: $ inline math $ (non-space edges avoid false positives on currency like $100 and $200)
    // 4: \( inline math \)
    // 5: **bold**
    // 6: `code`
    // 7: *italic*
    const pattern = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|(?<!\\)\$([^\$\s\n]|[^\$\s\n][^\$\n]*?[^\$\s\n])(?<!\\)\$|\\\(([\s\S]+?)\\\)|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*/g;
    let lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }
      if (match[1] !== undefined) {
        frag.appendChild(renderMath(match[1], true));
      } else if (match[2] !== undefined) {
        frag.appendChild(renderMath(match[2], true));
      } else if (match[3] !== undefined) {
        frag.appendChild(renderMath(match[3], false));
      } else if (match[4] !== undefined) {
        frag.appendChild(renderMath(match[4], false));
      } else if (match[5] !== undefined) {
        frag.appendChild(h("strong", { className: "ag-aux-md-strong" }, renderInlineMarkdown(match[5])));
      } else if (match[6] !== undefined) {
        frag.appendChild(h("code", { className: "ag-aux-md-inline-code" }, match[6]));
      } else if (match[7] !== undefined) {
        frag.appendChild(h("em", { className: "ag-aux-md-em" }, renderInlineMarkdown(match[7])));
      }
      lastIndex = pattern.lastIndex;
    }
    if (lastIndex < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
    return frag;
  }

  function renderMarkdownBlock(markdownText) {
    const container = h("div", { className: "ag-aux-md-body" });
    if (!markdownText) return container;

    const lines = String(markdownText).replace(/\r\n/g, "\n").split("\n");
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      // Fenced code block
      if (line.trim().startsWith("```")) {
        const lang = line.trim().slice(3).trim() || "code";
        const codeLines = [];
        i += 1;
        while (i < lines.length && !lines[i].trim().startsWith("```")) {
          codeLines.push(lines[i]);
          i += 1;
        }
        i += 1; // skip closing ```
        const codeText = codeLines.join("\n");
        const copyBtn = h(
          "button",
          {
            type: "button",
            className: "ag-aux-code-copy",
            onClick: () => {
              navigator.clipboard?.writeText(codeText).catch(() => {});
              copyBtn.textContent = "Copié ✓";
              setTimeout(() => {
                copyBtn.textContent = "Copier";
              }, 1600);
            }
          },
          "Copier"
        );
        const pre = h(
          "div",
          { className: "ag-aux-code-block" },
          h(
            "div",
            { className: "ag-aux-code-header" },
            h("span", { className: "ag-aux-code-lang" }, lang),
            copyBtn
          ),
          h("pre", { className: "ag-aux-code-pre" }, h("code", {}, codeText))
        );
        container.appendChild(pre);
        continue;
      }

      // Standalone Display Math Block ($$ ... $$)
      if (line.trim().startsWith("$$")) {
        const trimmed = line.trim();
        if (trimmed.length > 2 && trimmed.endsWith("$$") && trimmed !== "$$") {
          const tex = trimmed.slice(2, -2).trim();
          container.appendChild(renderMath(tex, true));
          i += 1;
          continue;
        }
        const mathLines = [trimmed.slice(2)];
        i += 1;
        while (i < lines.length && !lines[i].includes("$$")) {
          mathLines.push(lines[i]);
          i += 1;
        }
        if (i < lines.length) {
          const last = lines[i];
          const closingIdx = last.indexOf("$$");
          mathLines.push(last.slice(0, closingIdx));
          i += 1;
        }
        const tex = mathLines.join("\n").trim();
        container.appendChild(renderMath(tex, true));
        continue;
      }

      // Standalone Display Math Block (\[ ... \])
      if (line.trim().startsWith("\\[")) {
        const trimmed = line.trim();
        if (trimmed.endsWith("\\]")) {
          const tex = trimmed.slice(2, -2).trim();
          container.appendChild(renderMath(tex, true));
          i += 1;
          continue;
        }
        const mathLines = [trimmed.slice(2)];
        i += 1;
        while (i < lines.length && !lines[i].includes("\\]")) {
          mathLines.push(lines[i]);
          i += 1;
        }
        if (i < lines.length) {
          const last = lines[i];
          const closingIdx = last.indexOf("\\]");
          mathLines.push(last.slice(0, closingIdx));
          i += 1;
        }
        const tex = mathLines.join("\n").trim();
        container.appendChild(renderMath(tex, true));
        continue;
      }

      // Horizontal Rule (---, ***, ___)
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
        container.appendChild(h("hr", { className: "ag-aux-md-hr" }));
        i += 1;
        continue;
      }

      // Empty line
      if (!line.trim()) {
        i += 1;
        continue;
      }

      // Headings
      const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const tag = level === 1 ? "h3" : level === 2 ? "h4" : "h5";
        container.appendChild(
          h(tag, { className: `ag-aux-md-h ag-aux-md-h${level}` }, renderInlineMarkdown(headingMatch[2]))
        );
        i += 1;
        continue;
      }

      // Blockquote
      if (line.trim().startsWith(">")) {
        const quoteLines = [];
        while (i < lines.length && lines[i].trim().startsWith(">")) {
          quoteLines.push(lines[i].replace(/^\s*>\s?/, ""));
          i += 1;
        }
        container.appendChild(
          h("blockquote", { className: "ag-aux-md-quote" }, renderInlineMarkdown(quoteLines.join("\n")))
        );
        continue;
      }

      // Unordered list
      if (/^\s*[-*•]\s+/.test(line)) {
        const ul = h("ul", { className: "ag-aux-md-ul" });
        while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
          const itemText = lines[i].replace(/^\s*[-*•]\s+/, "");
          ul.appendChild(h("li", { className: "ag-aux-md-li" }, renderInlineMarkdown(itemText)));
          i += 1;
        }
        container.appendChild(ul);
        continue;
      }

      // Ordered list
      if (/^\s*\d+\.\s+/.test(line)) {
        const ol = h("ol", { className: "ag-aux-md-ol" });
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
          const itemText = lines[i].replace(/^\s*\d+\.\s+/, "");
          ol.appendChild(h("li", { className: "ag-aux-md-li" }, renderInlineMarkdown(itemText)));
          i += 1;
        }
        container.appendChild(ol);
        continue;
      }

      // Paragraph
      const paraLines = [line];
      i += 1;
      while (
        i < lines.length &&
        lines[i].trim() &&
        !lines[i].trim().startsWith("```") &&
        !lines[i].trim().startsWith("$$") &&
        !lines[i].trim().startsWith("\\[") &&
        !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim()) &&
        !lines[i].trim().startsWith("#") &&
        !lines[i].trim().startsWith(">") &&
        !/^\s*[-*•]\s+/.test(lines[i]) &&
        !/^\s*\d+\.\s+/.test(lines[i])
      ) {
        paraLines.push(lines[i]);
        i += 1;
      }
      container.appendChild(
        h("p", { className: "ag-aux-md-p" }, renderInlineMarkdown(paraLines.join(" ")))
      );
    }

    return container;
  }

  /* ── Stylesheet Injection ────────────────────────────────────────────────── */
  const STYLES = `
    /* Expand native Selection Quote Popup so "Quote" + "Poser une question" fit side-by-side */
    .selection-quote-popup {
      width: auto !important;
      min-width: max-content !important;
      max-width: min(92vw, 440px) !important;
    }
    .selection-quote-popup > div {
      display: flex !important;
      flex-direction: row !important;
      align-items: stretch !important;
      white-space: nowrap !important;
    }
    button[data-testid="selection-aux-ask-button"] {
      display: inline-flex !important;
      align-items: center !important;
      gap: 5px !important;
      padding: 4px 10px !important;
      font-size: 12px !important;
      line-height: 1.2 !important;
      font-weight: 500 !important;
      color: var(--primary, #cba6f7) !important;
      background: transparent !important;
      border: none !important;
      border-left: 1px solid var(--border, rgba(255, 255, 255, 0.14)) !important;
      cursor: pointer !important;
      transition: background-color 0.15s ease, color 0.15s ease !important;
      white-space: nowrap !important;
    }
    button[data-testid="selection-aux-ask-button"]:hover {
      background: var(--secondary, rgba(203, 166, 247, 0.16)) !important;
    }

    /* Fallback selection popup when selecting inside code blocks or non-quotable nodes */
    .ag-aux-fallback-selection-popup {
      position: fixed;
      z-index: 99999;
      display: flex;
      align-items: stretch;
      background: var(--muted, #1e1e2e);
      color: var(--foreground, #cdd6f4);
      border: 1px solid var(--border, #313244);
      border-radius: 7px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.38);
      overflow: hidden;
      font-family: inherit;
      animation: agAuxFadeIn 0.12s ease-out;
    }
    .ag-aux-fallback-selection-popup button {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 5px 10px;
      font-size: 12px;
      font-weight: 500;
      color: inherit;
      background: transparent;
      border: none;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.14s ease;
    }
    .ag-aux-fallback-selection-popup button:hover {
      background: var(--secondary, rgba(255, 255, 255, 0.1));
    }
    .ag-aux-fallback-selection-popup button.ag-aux-primary-tab {
      color: var(--primary, #cba6f7);
      border-left: 1px solid var(--border, #313244);
    }

    /* Turn Action Bar Button (under each Assistant response) */
    .ag-aux-turn-btn {
      display: inline-flex;
      align-items: center;
       gap: 4px;
      height: 26px;
      padding: 0 8px;
      margin-left: 2px;
      border-radius: 6px;
      border: 1px solid transparent;
      background: transparent;
      color: var(--muted-foreground, #a6adc8);
      font-size: 11.5px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
    }
    .ag-aux-turn-btn:hover {
      color: var(--foreground, #cdd6f4);
      background: var(--secondary, rgba(255, 255, 255, 0.08));
      border-color: var(--border, rgba(255, 255, 255, 0.12));
    }

    /* Floating Toggle Pill on Right Edge when Panel is Closed */
    .ag-aux-edge-toggle {
      position: fixed;
      right: 14px;
      bottom: 22px;
      z-index: 9990;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 7px 13px;
      border-radius: 999px;
      background: var(--card, #1e1e2e);
      color: var(--foreground, #cdd6f4);
      border: 1px solid var(--border, #313244);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
      font-size: 12.5px;
      font-weight: 500;
      cursor: pointer;
      transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .ag-aux-edge-toggle:hover {
      transform: translateY(-1px);
      border-color: var(--primary, #cba6f7);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
    }
    .ag-aux-edge-toggle-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      border-radius: 999px;
      background: var(--primary, #cba6f7);
      color: var(--primary-foreground, #11111b);
      font-size: 10.5px;
      font-weight: 700;
    }

    /* Right-Hand Auxiliary Chat Drawer */
    .ag-aux-drawer {
      position: relative;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      height: 100%;
      min-height: 0;
      flex-shrink: 0;
      background: var(--sidebar, var(--card, #181825));
      color: var(--foreground, #cdd6f4);
      border-left: 1px solid var(--border, #313244);
      z-index: 45;
      user-select: text;
      font-family: inherit;
      box-shadow: -4px 0 20px rgba(0, 0, 0, 0.18);
    }
    .ag-aux-drawer:not(.ag-aux-drawer-fixed) {
      top: var(--ag-aux-host-top, 0px);
      height: calc(100% - var(--ag-aux-host-top, 0px));
    }
    .ag-aux-drawer[data-ag-aux-offset="true"] {
      border-top: 1px solid var(--border, #313244);
      border-top-left-radius: 10px;
    }
    .ag-aux-drawer.ag-aux-drawer-fixed {
      position: fixed;
      top: var(--ag-aux-top, 50px);
      right: 0;
      bottom: 0;
      height: calc(100vh - var(--ag-aux-top, 50px));
      z-index: 9995;
    }
    .ag-aux-resize-handle {
      position: absolute;
      left: -3px;
      top: 0;
      bottom: 0;
      width: 6px;
      cursor: col-resize;
      z-index: 10;
      transition: background 0.15s ease;
    }
    .ag-aux-resize-handle:hover,
    .ag-aux-resize-handle.ag-aux-resizing {
      background: var(--primary, #cba6f7);
    }

    /* Drawer Header */
    .ag-aux-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      padding: 9px 12px;
      border-bottom: 1px solid var(--border, #313244);
      flex-shrink: 0;
    }
    .ag-aux-header-title {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      font-size: 13px;
      font-weight: 600;
      color: var(--foreground, #cdd6f4);
      white-space: nowrap;
    }
    .ag-aux-header-badge {
      font-size: 10.5px;
      font-weight: 500;
      padding: 2px 6px;
      border-radius: 999px;
      background: var(--secondary, rgba(203, 166, 247, 0.14));
      color: var(--muted-foreground, #a6adc8);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 135px;
    }
    .ag-aux-header-actions {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }
    .ag-aux-icon-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      height: 28px;
      padding: 0 7px;
      border-radius: 6px;
      border: 1px solid transparent;
      background: transparent;
      color: var(--muted-foreground, #a6adc8);
      font-size: 11.5px;
      cursor: pointer;
      transition: all 0.14s ease;
    }
    .ag-aux-icon-btn:hover {
      background: var(--secondary, rgba(255, 255, 255, 0.08));
      color: var(--foreground, #cdd6f4);
    }

    .ag-aux-close-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      height: 28px;
      padding: 0 10px;
      border-radius: 6px;
      border: 1px solid var(--border, #313244);
      background: var(--muted, rgba(255, 255, 255, 0.06));
      color: var(--foreground, #cdd6f4);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .ag-aux-close-btn:hover {
      background: rgba(243, 139, 168, 0.2);
      border-color: #f38ba8;
      color: #f38ba8;
    }

    /* Active Excerpt Context Card */
    .ag-aux-excerpt-card {
      margin: 10px 12px 0;
      padding: 9px 11px;
      border-radius: 9px;
      background: var(--card, rgba(255, 255, 255, 0.04));
      border: 1px solid var(--border, #313244);
      border-left: 3px solid var(--primary, #cba6f7);
      display: flex;
      flex-direction: column;
      gap: 6px;
      flex-shrink: 0;
    }
    .ag-aux-excerpt-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      font-size: 11px;
      font-weight: 600;
      color: var(--muted-foreground, #a6adc8);
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .ag-aux-excerpt-text {
      font-size: 12px;
      line-height: 1.45;
      color: var(--foreground, #cdd6f4);
      max-height: 96px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: inherit;
      opacity: 0.92;
    }
    .ag-aux-excerpt-text.ag-aux-expanded {
      max-height: 240px;
    }


    /* Messages Scroll Container */
    .ag-aux-messages {
      flex: 1 1 0%;
      min-height: 0;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .ag-aux-empty {
      margin: auto 0;
      text-align: center;
      padding: 24px 16px;
      color: var(--muted-foreground, #a6adc8);
      font-size: 12.5px;
      line-height: 1.55;
    }
    .ag-aux-msg {
      display: flex;
      flex-direction: column;
      gap: 5px;
      max-width: 100%;
      animation: agAuxFadeIn 0.14s ease-out;
    }
    .ag-aux-role-label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.3px;
      text-transform: uppercase;
      color: var(--primary, #cba6f7);
      margin-bottom: 2px;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .ag-aux-role-label-user {
      align-self: flex-end;
      color: var(--primary, #f5a97f);
    }
    .ag-aux-msg-user {
      align-self: flex-end;
      max-width: 92%;
      padding: 9px 13px;
      border-radius: 12px 12px 3px 12px;
      background: var(--secondary, #313244);
      border: 1px solid rgba(245, 169, 127, 0.35);
      color: var(--foreground, #cdd6f4);
      font-size: 13.5px;
      font-weight: 500;
      line-height: 1.45;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .ag-aux-msg-assistant {
      align-self: stretch;
      padding: 10px 12px;
      border-radius: 10px;
      background: var(--card, rgba(255, 255, 255, 0.03));
      border: 1px solid var(--border, rgba(255, 255, 255, 0.07));
      color: var(--foreground, #cdd6f4);
      font-size: 13px;
      line-height: 1.55;
    }
    .ag-aux-msg-footer {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 4px;
    }
    .ag-aux-msg-action {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 7px;
      border-radius: 5px;
      border: none;
      background: transparent;
      color: var(--muted-foreground, #a6adc8);
      font-size: 11px;
      cursor: pointer;
    }
    .ag-aux-msg-action:hover {
      background: var(--secondary, rgba(255, 255, 255, 0.08));
      color: var(--foreground, #cdd6f4);
    }

    /* Markdown formatting inside Assistant messages */
    .ag-aux-md-body {
      display: flex;
      flex-direction: column;
      gap: 8px;
      word-break: break-word;
    }
    .ag-aux-md-p {
      margin: 0;
    }
    .ag-aux-md-h {
      margin: 4px 0 2px;
      font-weight: 600;
      line-height: 1.3;
    }
    .ag-aux-md-h3 { font-size: 14.5px; }
    .ag-aux-md-h4 { font-size: 13.5px; }
    .ag-aux-md-h5 { font-size: 13px; }
    .ag-aux-md-ul, .ag-aux-md-ol {
      margin: 0;
      padding-left: 18px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .ag-aux-md-quote {
      margin: 0;
      padding-left: 10px;
      border-left: 2px solid var(--primary, #cba6f7);
      color: var(--muted-foreground, #a6adc8);
    }
    .ag-aux-md-inline-code {
      padding: 1px 5px;
      border-radius: 4px;
      background: var(--secondary, rgba(255, 255, 255, 0.1));
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
    }
    .ag-aux-code-block {
      border-radius: 7px;
      border: 1px solid var(--border, #313244);
      background: var(--background, #11111b);
      overflow: hidden;
      margin: 2px 0;
    }
    .ag-aux-code-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 10px;
      background: rgba(255, 255, 255, 0.04);
      border-bottom: 1px solid var(--border, #313244);
      font-size: 11px;
      color: var(--muted-foreground, #a6adc8);
    }
    .ag-aux-code-copy {
      border: none;
      background: transparent;
      color: var(--muted-foreground, #a6adc8);
      font-size: 11px;
      cursor: pointer;
      padding: 1px 5px;
      border-radius: 4px;
    }
    .ag-aux-code-copy:hover {
      color: var(--foreground, #cdd6f4);
      background: rgba(255, 255, 255, 0.08);
    }
    .ag-aux-code-pre {
      margin: 0;
      padding: 9px 11px;
      overflow-x: auto;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      line-height: 1.45;
    }

    /* LaTeX Math & Divider Formatting */
    .ag-aux-math-block {
      display: block !important;
      margin: 8px 0 !important;
      padding: 4px 6px !important;
      overflow-x: auto !important;
      overflow-y: hidden !important;
      text-align: center !important;
      max-width: 100% !important;
      background: rgba(255, 255, 255, 0.02) !important;
      border-radius: 6px !important;
    }
    .ag-aux-math-inline {
      display: inline-block !important;
      vertical-align: middle !important;
      padding: 0 2px !important;
      max-width: 100% !important;
    }
    .ag-aux-math-block .katex-display {
      margin: 0 !important;
      overflow-x: auto !important;
      overflow-y: hidden !important;
    }
    .ag-aux-math-block .katex,
    .ag-aux-math-inline .katex {
      font-size: 1.05em !important;
      color: inherit !important;
      font-family: KaTeX_Math, KaTeX_Main, "Times New Roman", Cambria Math, serif !important;
    }
    .ag-aux-md-hr {
      border: none !important;
      border-top: 1px solid var(--border, rgba(255, 255, 255, 0.12)) !important;
      margin: 8px 0 !important;
    }

    /* Composer (Input Box at Bottom) */
    .ag-aux-composer {
      padding: 10px 12px 12px;
      border-top: 1px solid var(--border, #313244);
      display: flex;
      flex-direction: column;
      gap: 6px;
      flex-shrink: 0;
      background: var(--sidebar, var(--card, #181825));
    }
    .ag-aux-input-row {
      display: flex;
      align-items: flex-end;
      gap: 7px;
      padding: 7px 9px;
      border-radius: 10px;
      border: 1px solid var(--border, #313244);
      background: var(--background, #11111b);
      transition: border-color 0.15s ease;
    }
    .ag-aux-input-row:focus-within {
      border-color: var(--primary, #cba6f7);
    }
    .ag-aux-textarea {
      flex: 1 1 0%;
      min-width: 0;
      max-height: 130px;
      border: none;
      background: transparent;
      color: var(--foreground, #cdd6f4);
      font-family: inherit;
      font-size: 13px;
      line-height: 1.45;
      resize: none;
      outline: none;
      padding: 2px 0;
    }
    .ag-aux-textarea::placeholder {
      color: var(--muted-foreground, #a6adc8);
      opacity: 0.7;
    }
    .ag-aux-mic-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      border-radius: 999px;
      border: none;
      background: transparent;
      color: var(--muted-foreground, #a6adc8);
      cursor: pointer;
      flex-shrink: 0;
      transition: background-color 0.15s ease, color 0.15s ease, transform 0.12s ease;
    }
    .ag-aux-mic-btn:hover {
      background: var(--secondary, rgba(255, 255, 255, 0.08));
      color: var(--foreground, #cdd6f4);
    }
    .ag-aux-mic-btn.ag-aux-mic-recording {
      background: #ea4335;
      color: #ffffff;
      box-shadow: 0 0 0 0 rgba(234, 67, 53, 0.55);
      animation: agAuxMicPulse 1.4s ease-out infinite;
    }
    .ag-aux-mic-btn.ag-aux-mic-recording:hover {
      background: #d93025;
      transform: scale(1.04);
    }
    @keyframes agAuxMicPulse {
      0% { box-shadow: 0 0 0 0 rgba(234, 67, 53, 0.55); }
      70% { box-shadow: 0 0 0 7px rgba(234, 67, 53, 0); }
      100% { box-shadow: 0 0 0 0 rgba(234, 67, 53, 0); }
    }
    .ag-aux-send-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      border-radius: 8px;
      border: none;
      background: var(--primary, #cba6f7);
      color: var(--primary-foreground, #11111b);
      cursor: pointer;
      flex-shrink: 0;
      transition: opacity 0.15s ease, transform 0.12s ease;
    }
    .ag-aux-send-btn:disabled {
      opacity: 0.4;
      cursor: default;
    }
    .ag-aux-send-btn:not(:disabled):hover {
      transform: scale(1.04);
    }
    .ag-aux-status {
      font-size: 11px;
      color: var(--muted-foreground, #a6adc8);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 2px;
    }

    @keyframes agAuxFadeIn {
      from { opacity: 0; transform: translateY(3px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;

  function ensureStyles() {
    if (document.getElementById("ag-auxiliary-chat-styles")) return;
    const style = document.createElement("style");
    style.id = "ag-auxiliary-chat-styles";
    style.textContent = STYLES;
    (document.head || document.documentElement).appendChild(style);
  }

  /* ── Helper to Insert Quote into Main Chat Composer ──────────────────────── */
  function insertQuoteIntoMainComposer(text) {
    if (!text) return;
    const editor =
      document.querySelector('[data-testid="agent-input-box"] [data-lexical-editor="true"]') ||
      document.querySelector('[data-testid="agent-input-box"] [contenteditable="true"]') ||
      document.querySelector('[contenteditable="true"]');
    if (!editor) return;
    editor.focus();
    const quoted = text
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n") + "\n\n";
    try {
      document.execCommand("insertText", false, quoted);
    } catch {
      editor.textContent = (editor.textContent || "") + quoted;
    }
  }

  /* ── UI Elements & Drawer Management ─────────────────────────────────────── */
  let drawerEl = null;
  let edgeToggleEl = null;
  let headerBadgeEl = null;
  let excerptContainerEl = null;
  let messagesContainerEl = null;
  let textareaEl = null;
  let micBtnEl = null;
  let sendBtnEl = null;
  let statusTextEl = null;
  let excerptExpanded = false;
  let isGenerating = false;
  let activeAbortController = null;
  let activeRecognition = null;
  let isDictating = false;
  let dictationSessionId = 0;
  let dictationPrefix = "";
  let dictationSuffix = "";

  function getSpeechRecognitionCtor() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }

  function updateMicUI() {
    if (!micBtnEl) return;
    if (isDictating) {
      micBtnEl.classList.add("ag-aux-mic-recording");
      micBtnEl.title = "Arrêter la dictée";
      micBtnEl.setAttribute("aria-label", "Arrêter la dictée");
    } else {
      micBtnEl.classList.remove("ag-aux-mic-recording");
      micBtnEl.title = "Dicter au micro";
      micBtnEl.setAttribute("aria-label", "Dicter au micro");
    }
  }

  function stopDictation({ abort = false, focus = false } = {}) {
    dictationSessionId += 1;
    const rec = activeRecognition;
    activeRecognition = null;
    const wasDictating = isDictating;
    isDictating = false;
    updateMicUI();
    if (wasDictating && !isGenerating) {
      updateStatusText();
    }
    if (rec) {
      try {
        if (abort) rec.abort();
        else rec.stop();
      } catch {}
    }
    if (focus) {
      textareaEl?.focus();
    }
  }

  function startDictation() {
    const SpeechRec = getSpeechRecognitionCtor();
    if (!SpeechRec) {
      updateStatusText("Dictée vocale non supportée sur ce navigateur");
      return;
    }

    const currentVal = textareaEl ? textareaEl.value : "";
    const start = typeof textareaEl?.selectionStart === "number" ? textareaEl.selectionStart : currentVal.length;
    const end = typeof textareaEl?.selectionEnd === "number" ? textareaEl.selectionEnd : currentVal.length;
    dictationPrefix = currentVal.slice(0, start);
    dictationSuffix = currentVal.slice(end);

    const sessionId = ++dictationSessionId;
    const rec = new SpeechRec();
    const navLang = (navigator.language || "").trim();
    rec.lang = !navLang || navLang.toLowerCase().startsWith("fr") ? "fr-FR" : navLang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    activeRecognition = rec;
    isDictating = true;
    updateMicUI();
    updateStatusText("Initialisation du micro…");

    rec.onstart = () => {
      if (sessionId !== dictationSessionId) return;
      updateStatusText("Dictée en cours… Parlez maintenant");
    };

    rec.onresult = (event) => {
      if (sessionId !== dictationSessionId || !textareaEl) return;
      let finalPart = "";
      let interimPart = "";
      for (let i = 0; i < event.results.length; i += 1) {
        const res = event.results[i];
        const txt = res?.[0]?.transcript || "";
        if (res.isFinal) finalPart += txt;
        else interimPart += txt;
      }
      const spoken = (finalPart + interimPart).trimStart();
      if (!spoken) return;
      const sepBefore = dictationPrefix.length > 0 && !/\s$/.test(dictationPrefix) ? " " : "";
      const sepAfter = dictationSuffix.length > 0 && !/^\s/.test(dictationSuffix) ? " " : "";
      textareaEl.value = dictationPrefix + sepBefore + spoken + sepAfter + dictationSuffix;
      const caretPos = (dictationPrefix + sepBefore + spoken).length;
      try {
        textareaEl.setSelectionRange(caretPos, caretPos);
      } catch {}
      autoResizeTextarea();
      textareaEl.scrollTop = textareaEl.scrollHeight;
    };

    rec.onerror = (event) => {
      if (sessionId !== dictationSessionId) return;
      const errCode = event?.error || "";
      if (errCode === "aborted") return;
      let errMsg = "Erreur de dictée vocale";
      if (errCode === "not-allowed" || errCode === "service-not-allowed") {
        errMsg = "Accès au micro refusé (autorisez le micro)";
      } else if (errCode === "audio-capture") {
        errMsg = "Aucun microphone détecté";
      } else if (errCode === "network") {
        errMsg = "Dictée vocale indisponible (erreur réseau)";
      } else if (errCode === "no-speech") {
        errMsg = "Aucune parole détectée";
      }
      isDictating = false;
      activeRecognition = null;
      dictationSessionId += 1;
      updateMicUI();
      updateStatusText(errMsg);
    };

    rec.onend = () => {
      if (sessionId !== dictationSessionId) return;
      isDictating = false;
      activeRecognition = null;
      updateMicUI();
      if (!isGenerating) updateStatusText();
      textareaEl?.focus();
    };

    try {
      rec.start();
    } catch {
      isDictating = false;
      activeRecognition = null;
      dictationSessionId += 1;
      updateMicUI();
      updateStatusText("Impossible de démarrer le micro");
    }
  }

  function toggleDictation() {
    if (isDictating) stopDictation({ abort: false, focus: true });
    else startDictation();
  }

  function autoResizeTextarea() {
    if (!textareaEl) return;
    textareaEl.style.height = "auto";
    textareaEl.style.height = `${Math.min(130, Math.max(24, textareaEl.scrollHeight))}px`;
  }

  function renderExcerptSection() {
    if (!excerptContainerEl) return;
    while (excerptContainerEl.firstChild) excerptContainerEl.removeChild(excerptContainerEl.firstChild);

    const thread = getActiveThread();
    if (!thread.excerpt) {
      excerptContainerEl.style.display = "none";
      return;
    }

    excerptContainerEl.style.display = "flex";
    const toggleExpandBtn = h(
      "button",
      {
        type: "button",
        className: "ag-aux-icon-btn",
        onClick: () => {
          excerptExpanded = !excerptExpanded;
          renderExcerptSection();
        }
      },
      excerptExpanded ? "Réduire" : "Voir tout"
    );
    const clearExcerptBtn = h(
      "button",
      {
        type: "button",
        className: "ag-aux-icon-btn",
        title: "Retirer l'extrait",
        onClick: () => {
          thread.excerpt = "";
          saveState();
          renderExcerptSection();
        }
      },
      svgIcon("0 -960 960 960", ICON_CLOSE, 13)
    );

    const headerRow = h(
      "div",
      { className: "ag-aux-excerpt-top" },
      h("span", {}, "📌 Extrait sélectionné"),
      h("div", { style: { display: "flex", gap: "2px" } }, toggleExpandBtn, clearExcerptBtn)
    );

    const bodyEl = h(
      "div",
      { className: `ag-aux-excerpt-text${excerptExpanded ? " ag-aux-expanded" : ""}` },
      thread.excerpt
    );

    excerptContainerEl.append(headerRow, bodyEl);
  }

  function renderMessagesList() {
    if (!messagesContainerEl) return;
    while (messagesContainerEl.firstChild) messagesContainerEl.removeChild(messagesContainerEl.firstChild);

    const thread = getActiveThread();
    if (!thread.messages || thread.messages.length === 0) {
      messagesContainerEl.appendChild(
        h(
          "div",
          { className: "ag-aux-empty" },
          h("div", { style: { fontSize: "22px", marginBottom: "8px" } }, "💬"),
          h(
            "div",
            { style: { fontWeight: "600", color: "var(--foreground, #cdd6f4)", marginBottom: "4px" } },
            "Chat auxiliaire prêt"
          ),
          h(
            "div",
            {},
            "Surlignez n'importe quel passage d'une réponse et cliquez sur « Poser une question » (à côté de Quote), ou posez directement votre question ci-dessous sans polluer le fil principal."
          )
        )
      );
      return;
    }

    let lastUserWrap = null;
    for (const msg of thread.messages) {
      if (msg.role === "user") {
        const msgWrap = h("div", { className: "ag-aux-msg", "data-aux-role": "user" });
        msgWrap.appendChild(h("div", { className: "ag-aux-role-label ag-aux-role-label-user" }, "Votre question"));
        if (msg.excerptPreview) {
          msgWrap.appendChild(
            h(
              "div",
              {
                style: {
                  alignSelf: "flex-end",
                  maxWidth: "88%",
                  fontSize: "11px",
                  color: "var(--muted-foreground, #a6adc8)",
                  padding: "3px 8px",
                  borderLeft: "2px solid var(--primary, #cba6f7)",
                  marginBottom: "2px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis"
                }
              },
              `« ${msg.excerptPreview.slice(0, 90)}${msg.excerptPreview.length > 90 ? "…" : ""} »`
            )
          );
        }
        msgWrap.appendChild(h("div", { className: "ag-aux-msg-user" }, msg.text));
        messagesContainerEl.appendChild(msgWrap);
        lastUserWrap = msgWrap;
      } else {
        const copyBtn = h(
          "button",
          {
            type: "button",
            className: "ag-aux-msg-action",
            onClick: () => {
              navigator.clipboard?.writeText(msg.text || "").catch(() => {});
              copyBtn.textContent = "✓ Copié";
              setTimeout(() => {
                copyBtn.textContent = "Copier";
              }, 1500);
            }
          },
          "Copier"
        );
        const quoteInMainBtn = h(
          "button",
          {
            type: "button",
            className: "ag-aux-msg-action",
            title: "Citer cette réponse dans le chat principal",
            onClick: () => {
              insertQuoteIntoMainComposer(msg.text || "");
            }
          },
          "↩ Citer dans le chat principal"
        );
        const assistantCard = h(
          "div",
          { className: "ag-aux-msg", "data-aux-role": "assistant" },
          h("div", { className: "ag-aux-role-label" }, "Réponse"),
          h(
            "div",
            { className: "ag-aux-msg-assistant" },
            renderMarkdownBlock(msg.text || (msg.streaming ? "Réflexion en cours…" : ""))
          ),
          !msg.streaming ? h("div", { className: "ag-aux-msg-footer" }, copyBtn, quoteInMainBtn) : null
        );
        messagesContainerEl.appendChild(assistantCard);
      }
    }

    if (lastUserWrap) {
      const topTarget = Math.max(0, lastUserWrap.offsetTop - 10);
      messagesContainerEl.scrollTop = topTarget;
    }
  }

  function updateEdgeToggle() {
    if (!document.body) return;
    const existingToggles = document.querySelectorAll(".ag-aux-edge-toggle");
    if (existingToggles.length > 0) {
      edgeToggleEl = existingToggles[0];
      for (let i = 1; i < existingToggles.length; i++) {
        existingToggles[i].remove();
      }
    } else {
      edgeToggleEl = h(
        "button",
        {
          type: "button",
          className: "ag-aux-edge-toggle",
          title: "Ouvrir le Chat auxiliaire (Alt+Q)",
          onClick: () => openAuxiliaryChat()
        },
        svgIcon("0 -960 960 960", ICON_CHAT_QUESTION, 16),
        h("span", {}, "Chat auxiliaire")
      );
      document.body.appendChild(edgeToggleEl);
    }
    const thread = getActiveThread();
    const count = (thread.messages || []).filter((m) => m.role === "assistant").length;
    edgeToggleEl.style.display = state.open ? "none" : "inline-flex";
    const existingBadge = edgeToggleEl.querySelector(".ag-aux-edge-toggle-badge");
    if (existingBadge) existingBadge.remove();
    if (count > 0) {
      edgeToggleEl.appendChild(h("span", { className: "ag-aux-edge-toggle-badge" }, String(count)));
    }
  }

  function isRemoteEnvironment() {
    try {
      const host = location.hostname || "";
      return (
        window.self !== window.top ||
        host.includes("antigravity.google") ||
        host.endsWith("usercontent.goog") ||
        document.documentElement?.hasAttribute("data-bg-remote-port") ||
        !!document.querySelector("[data-bg-remote-sidebar]")
      );
    } catch {
      return true;
    }
  }

  function detectTopRightControlsBottom() {
    let maxBottom = 0;
    const minRight = Math.max(0, window.innerWidth - Math.max(520, (state.width || 410) + 80));
    const selectors = [
      '[data-testid="pane-titlebar-toolbar"]',
      '[data-testid="titlebar-more-actions"]',
      'img[src*="googleusercontent"]',
      'button[aria-label*="Google"]',
      'a[aria-label*="Google"]',
      'a[href*="accounts.google.com"]',
      '[data-testid="user-avatar"]',
      '[class*="avatar"]'
    ];
    try {
      for (const el of document.querySelectorAll(selectors.join(","))) {
        if (el.closest("#ag-auxiliary-chat-drawer")) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        if (rect.top >= -4 && rect.top <= 56 && rect.bottom <= 84 && rect.right >= minRight) {
          maxBottom = Math.max(maxBottom, Math.ceil(rect.bottom));
        }
      }
    } catch {}
    return maxBottom;
  }

  function updateDrawerTopOffset() {
    if (!drawerEl) return;
    const controlsBottom = detectTopRightControlsBottom();
    const remote = isRemoteEnvironment();

    if (drawerEl.classList.contains("ag-aux-drawer-fixed")) {
      let topOffset = remote ? 52 : 44;
      if (controlsBottom > 0) {
        topOffset = Math.max(topOffset, Math.min(84, controlsBottom + 8));
      } else {
        const convo = document.querySelector('[data-testid="conversation-view"]');
        if (convo) {
          const rect = convo.getBoundingClientRect();
          if (rect.top >= 32) {
            topOffset = Math.max(topOffset, rect.top);
          }
        }
      }
      drawerEl.style.removeProperty("--ag-aux-host-top");
      drawerEl.style.setProperty("--ag-aux-top", `${Math.round(topOffset)}px`);
      drawerEl.setAttribute("data-ag-aux-offset", "true");
    } else {
      const host = drawerEl.parentElement;
      const hostRect = host?.getBoundingClientRect?.();
      const hostTop = hostRect ? Math.max(0, hostRect.top) : 0;
      let neededOffset = 0;

      if (controlsBottom > hostTop + 2) {
        neededOffset = Math.max(neededOffset, Math.min(84, controlsBottom - hostTop + 8));
      }
      if (remote && hostTop < 52) {
        neededOffset = Math.max(neededOffset, 52 - Math.floor(hostTop));
      }

      drawerEl.style.removeProperty("--ag-aux-top");
      if (neededOffset > 0) {
        drawerEl.style.setProperty("--ag-aux-host-top", `${Math.round(neededOffset)}px`);
        drawerEl.setAttribute("data-ag-aux-offset", "true");
      } else {
        drawerEl.style.removeProperty("--ag-aux-host-top");
        drawerEl.removeAttribute("data-ag-aux-offset");
      }
    }
  }

  function isAntigravityWorkFrame() {
    return !!(
      document.querySelector('[data-testid="conversation-view"]') ||
      document.querySelector('[data-testid="conversation-list-sidebar"]') ||
      document.querySelector('[data-bg-remote-sidebar]') ||
      document.querySelector('[data-testid="new-conversation-button"]')
    );
  }

  function ensureDrawerMounted() {
    if (!isAntigravityWorkFrame()) {
      document.querySelectorAll(".ag-aux-drawer, .ag-aux-edge-toggle").forEach((el) => el.remove());
      return;
    }
    ensureStyles();
    if (!document.body) return;

    const existingDrawers = document.querySelectorAll(".ag-aux-drawer");
    if (existingDrawers.length > 0) {
      drawerEl = existingDrawers[0];
      for (let i = 1; i < existingDrawers.length; i++) {
        existingDrawers[i].remove();
      }
    }

    if (!drawerEl) {
      // Resize handle
      const resizeHandle = h("div", {
        className: "ag-aux-resize-handle",
        title: "Glisser pour redimensionner"
      });
      resizeHandle.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        resizeHandle.classList.add("ag-aux-resizing");
        const startX = e.clientX;
        const startWidth = state.width || 410;
        const onMove = (ev) => {
          const nextWidth = Math.round(Math.min(680, Math.max(300, startWidth + (startX - ev.clientX))));
          state.width = nextWidth;
          if (drawerEl) drawerEl.style.width = `${nextWidth}px`;
        };
        const onUp = () => {
          resizeHandle.classList.remove("ag-aux-resizing");
          saveState();
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      });

      // Header
      const newThreadBtn = h(
        "button",
        {
          type: "button",
          className: "ag-aux-icon-btn",
          title: "Nouvelle discussion auxiliaire",
          onClick: () => {
            const key = currentThreadKey();
            const prev = state.threadsByConvo[key];
            if (prev?.auxCascadeId) {
              const svc = findAgentService();
              try {
                svc?.deleteCascadeTrajectory?.(prev.auxCascadeId);
              } catch {}
            }
            state.threadsByConvo[key] = {
              auxCascadeId: null,
              parentCascadeId: currentConversationId() || null,
              excerpt: prev?.excerpt || "",
              lastSentExcerpt: "",
              messages: []
            };
            saveState();
            renderExcerptSection();
            renderMessagesList();
          }
        },
        svgIcon("0 -960 960 960", ICON_PLUS, 15),
        h("span", {}, "Nouveau")
      );

      const closeBtn = h(
        "button",
        {
          type: "button",
          className: "ag-aux-close-btn",
          title: "Fermer le chat auxiliaire (Échap ou Alt+Q)",
          "aria-label": "Fermer le chat auxiliaire",
          onClick: (e) => {
            e.stopPropagation();
            closeAuxiliaryChat();
          }
        },
        svgIcon("0 -960 960 960", ICON_CLOSE, 16),
        h("span", {}, "Fermer")
      );

      const headerEl = h(
        "div",
        { className: "ag-aux-header" },
        h(
          "div",
          { className: "ag-aux-header-title" },
          svgIcon("0 -960 960 960", ICON_CHAT_QUESTION, 17),
          h("span", {}, "Chat auxiliaire"),
          headerBadgeEl = h("span", { className: "ag-aux-header-badge", title: "Modèle IA actif pour le chat auxiliaire" }, "Gemini 3.8 Flash (High)")
        ),
        h("div", { className: "ag-aux-header-actions" }, newThreadBtn, closeBtn)
      );

      excerptContainerEl = h("div", { className: "ag-aux-excerpt-card", style: { display: "none" } });
      messagesContainerEl = h("div", { className: "ag-aux-messages" });

      textareaEl = h("textarea", {
        className: "ag-aux-textarea",
        rows: "1",
        placeholder: "Posez une question sur cet extrait…",
        onInput: () => autoResizeTextarea(),
        onKeyDown: (e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (isGenerating) return;
            if (isDictating) stopDictation({ abort: false, focus: false });
            const val = textareaEl.value.trim();
            if (val) {
              textareaEl.value = "";
              autoResizeTextarea();
              void submitAuxiliaryQuestion(val);
            }
          }
        }
      });

      micBtnEl = h(
        "button",
        {
          type: "button",
          className: "ag-aux-mic-btn",
          title: "Dicter au micro",
          "aria-label": "Dicter au micro",
          onClick: () => toggleDictation()
        },
        svgIcon("0 -960 960 960", ICON_MIC, 17)
      );

      sendBtnEl = h(
        "button",
        {
          type: "button",
          className: "ag-aux-send-btn",
          title: "Envoyer (Entrée)",
          onClick: () => {
            if (isGenerating) {
              if (activeAbortController) activeAbortController.abort();
              return;
            }
            if (isDictating) stopDictation({ abort: false, focus: false });
            const val = textareaEl.value.trim();
            if (val) {
              textareaEl.value = "";
              autoResizeTextarea();
              void submitAuxiliaryQuestion(val);
            }
          }
        },
        svgIcon("0 -960 960 960", ICON_SEND, 15)
      );

      statusTextEl = h("div", { className: "ag-aux-status" });

      const composerEl = h(
        "div",
        { className: "ag-aux-composer" },
        h("div", { className: "ag-aux-input-row" }, textareaEl, micBtnEl, sendBtnEl),
        statusTextEl
      );

      drawerEl = h(
        "aside",
        {
          id: "ag-auxiliary-chat-drawer",
          className: "ag-aux-drawer",
          style: { width: `${state.width || 410}px`, display: state.open ? "flex" : "none" }
        },
        resizeHandle,
        headerEl,
        excerptContainerEl,
        messagesContainerEl,
        composerEl
      );
    }

    // Mount inside overview-panel-host (flex row beside conversation-view) if available
    const host = document.querySelector('[data-testid="overview-panel-host"]');
    if (host) {
      drawerEl.classList.remove("ag-aux-drawer-fixed");
      if (drawerEl.parentElement !== host) {
        host.appendChild(drawerEl);
      }
      updateDrawerTopOffset();
    } else {
      drawerEl.classList.add("ag-aux-drawer-fixed");
      if (drawerEl.parentElement !== document.body) {
        document.body.appendChild(drawerEl);
      }
      updateDrawerTopOffset();
    }

    drawerEl.style.width = `${state.width || 410}px`;
    drawerEl.style.display = state.open ? "flex" : "none";
    updateStatusText();
    updateEdgeToggle();
  }

  function updateStatusText(customText) {
    const model = detectActiveModel();
    const modelLabel = model.label || "Gemini 3.8 Flash (High)";
    if (headerBadgeEl) {
      headerBadgeEl.textContent = modelLabel;
    }
    if (!statusTextEl) return;
    while (statusTextEl.firstChild) statusTextEl.removeChild(statusTextEl.firstChild);
    let left = customText;
    if (!left) {
      if (isGenerating) left = "Génération de la réponse…";
      else if (isDictating) left = "Dictée en cours… Parlez maintenant";
      else left = `Modèle : ${modelLabel}`;
    }
    statusTextEl.append(
      h("span", {}, left),
      h("span", { style: { opacity: "0.7" } }, "Échap / Alt+Q")
    );
  }

  function setGeneratingUI(generating) {
    isGenerating = generating;
    if (!sendBtnEl) return;
    while (sendBtnEl.firstChild) sendBtnEl.removeChild(sendBtnEl.firstChild);
    if (generating) {
      sendBtnEl.title = "Arrêter";
      sendBtnEl.appendChild(svgIcon("0 -960 960 960", ICON_STOP, 15));
      updateStatusText("Génération de la réponse…");
    } else {
      sendBtnEl.title = "Envoyer (Entrée)";
      sendBtnEl.appendChild(svgIcon("0 -960 960 960", ICON_SEND, 15));
      updateStatusText();
    }
  }

  function openAuxiliaryChat(excerptText) {
    state.open = true;
    const thread = getActiveThread();
    if (typeof excerptText === "string" && excerptText.trim()) {
      thread.excerpt = excerptText.trim();
      excerptExpanded = false;
    }
    saveState();
    ensureDrawerMounted();
    updateDrawerTopOffset();
    renderExcerptSection();
    renderMessagesList();
    setTimeout(() => {
      textareaEl?.focus();
    }, 30);
  }

  function closeAuxiliaryChat() {
    if (isDictating) stopDictation({ abort: true, focus: false });
    state.open = false;
    saveState();
    ensureDrawerMounted();
  }

  function toggleAuxiliaryChat() {
    if (state.open) closeAuxiliaryChat();
    else openAuxiliaryChat();
  }

  /* ── AI Engines (Native Antigravity SIDE_QUESTION + Direct Gemini Fallback) ─ */
  function extractPlannerResponsesFromSteps(steps, startIndex = 0) {
    if (!Array.isArray(steps)) return { response: "", thinking: "", done: false, error: "" };
    const slice = steps.slice(Math.max(0, startIndex));
    const responses = [];
    let thinking = "";
    let lastStatus = 0;
    let errorText = "";

    for (const s of slice) {
      const stepCase = s?.step?.case;
      const stepVal = s?.step?.value || s?.plannerResponse;
      if (stepCase === "plannerResponse" || s?.plannerResponse) {
        const resp = stepVal?.response || stepVal?.modifiedResponse || "";
        const thk = stepVal?.thinking || stepVal?.rawThinking || "";
        if (resp.trim()) responses.push(resp.trim());
        if (thk.trim()) thinking = thk.trim();
        if (typeof s?.status === "number") lastStatus = s.status;
      } else if (stepCase === "errorMessage") {
        errorText = stepVal?.error?.message || stepVal?.userErrorMessage || "Erreur lors de la génération.";
      }
    }

    // CortexStepStatus: DONE = 3, CANCELED = 6, ERROR = 7, INTERRUPTED = 12
    const done = lastStatus === 3 || lastStatus === 6 || lastStatus === 7 || lastStatus === 12;
    return {
      response: responses.join("\n\n"),
      thinking,
      done,
      error: errorText
    };
  }

  function getMainChatRecentContext() {
    try {
      const view = document.querySelector('[data-testid="conversation-view"]');
      if (!view) return "";
      const articles = view.querySelectorAll('[role="article"]');
      if (!articles || articles.length === 0) return "";
      const lastArticle = articles[articles.length - 1];
      const text = (lastArticle.textContent || "").trim();
      return text.length > 2500 ? text.slice(-2500) : text;
    } catch {
      return "";
    }
  }

  async function askViaNativeAgentService(thread, question, assistantMsg, signal) {
    const agentService = findAgentService();
    if (!agentService || typeof agentService.startCascade !== "function" || typeof agentService.sendUserCascadeMessage !== "function") {
      throw new Error("Service Antigravity introuvable sur cette page. Ouvrez une conversation Antigravity.");
    }

    const model = detectActiveModel();
    const modelValue = model.value || GEMINI_38_FLASH_HIGH;
    const modelLabel = model.label || "Gemini 3.8 Flash (High)";

    // Always use a fresh, isolated SIDE_QUESTION cascade WITHOUT baseTrajectoryIdentifier!
    // Passing baseTrajectoryIdentifier cloned all 20+ previous responses from the main conversation
    // into the trajectory steps, causing extractPlannerResponsesFromSteps to concatenate the entire main chat!
    if (thread.auxCascadeId) {
      try {
        agentService.deleteCascadeTrajectory?.(thread.auxCascadeId);
      } catch {}
    }

    const auxId = crypto.randomUUID();
    await agentService.startCascade({
      cascadeId: auxId,
      trajectoryType: 22, // V.CortexTrajectoryType.SIDE_QUESTION (hidden from sidebar)
      source: 1, // V.CortexTrajectorySource.CASCADE_CLIENT
      requestedModel: modelValue
    });

    thread.auxCascadeId = auxId;
    thread.modelValue = modelValue;
    thread.modelLabel = modelLabel;
    saveState();

    // Build focused, concise prompt with selected excerpt + prior auxiliary Q&A history
    const promptParts = [
      "Tu es un assistant IA auxiliaire d'explication intégré à Antigravity.",
      "Réponds UNIQUEMENT et DIRECTEMENT à la question posée par l'utilisateur ci-dessous, de manière claire, structurée et synthétique en français (ne fais pas un cours hors-sujet de 3 pages si la question porte sur un point précis).",
      "Formatte toutes les variables et formules mathématiques en LaTeX standard : utilise $...$ pour les formules en ligne et $$...$$ pour les équations en bloc.",
      "Tes outils sont désactivés : réponds directement en texte."
    ];

    if (thread.excerpt) {
      promptParts.push(
        `Extrait sélectionné par l'utilisateur :
"""
${thread.excerpt}
"""`
      );
    } else {
      const recentMain = getMainChatRecentContext();
      if (recentMain) {
        promptParts.push(
          `Contexte récent de la conversation principale (pour référence uniquement) :
"""
${recentMain}
"""`
        );
      }
    }

    // Include up to the last 6 completed messages from this auxiliary chat for follow-up continuity
    const priorMessages = (thread.messages || []).slice(0, -2).filter((m) => m.text && !m.streaming).slice(-6);
    if (priorMessages.length > 0) {
      const historyLines = priorMessages.map((m) =>
        m.role === "user" ? `Utilisateur : ${m.text}` : `Assistant : ${m.text}`
      );
      promptParts.push(`Historique récent de ce chat auxiliaire :
${historyLines.join("\n\n")}`);
    }

    promptParts.push(`Question précise de l'utilisateur à laquelle tu dois répondre maintenant :
${question}`);
    const fullPrompt = promptParts.join("\n\n");

    await agentService.sendUserCascadeMessage({
      cascadeId: auxId,
      items: [{ chunk: { case: "text", value: fullPrompt } }],
      cascadeConfig: {
        plannerConfig: {
          planModel: modelValue,
          thinkingConfig: {
            thinkingLevel: 3,
            thinkingBudget: -1
          },
          toolConfig: { forceDisableToolCalling: true },
          supportsLatexRendering: true
        },
        executorConfig: { useCoreDirect: true }
      }
    });

    await new Promise((resolve, reject) => {
      let settled = false;
      let provider = null;
      let pollTimer = null;
      let timeoutTimer = null;

      const cleanup = () => {
        settled = true;
        if (pollTimer) clearInterval(pollTimer);
        if (timeoutTimer) clearTimeout(timeoutTimer);
        try {
          provider?.dispose?.();
        } catch {}
      };

      if (signal) {
        signal.addEventListener(
          "abort",
          () => {
            cleanup();
            try {
              agentService.cancelCascadeInvocation?.({ cascadeId: auxId });
            } catch {}
            resolve();
          },
          { once: true }
        );
      }

      const handleSteps = (steps, runStatus) => {
        if (settled) return;
        const { response, thinking, done, error } = extractPlannerResponsesFromSteps(steps, 0);
        if (error && !response) {
          cleanup();
          reject(new Error(error));
          return;
        }
        if (response) {
          assistantMsg.text = response;
          renderMessagesList();
        } else if (thinking) {
          assistantMsg.text = "*Réflexion en cours…*";
          renderMessagesList();
        }
        if ((done || runStatus === 1) && response) {
          cleanup();
          resolve();
        }
      };

      if (typeof agentService.createAgentStateProviderForConvo === "function") {
        try {
          provider = agentService.createAgentStateProviderForConvo(auxId, {
            initialStepsSlice: { startIndex: 0 },
            initialGeneratorMetadatasSlice: { startIndex: 0, endIndexExclusive: 0 },
            initialExecutorMetadatasSlice: { startIndex: 0, endIndexExclusive: 0 }
          });
          provider.onDidChange((st) => {
            const steps = st?.trajectorySlice?.stepsInSlice;
            if (Array.isArray(steps)) {
              handleSteps(steps, st?.status);
            }
          });
        } catch {}
      }

      pollTimer = setInterval(async () => {
        if (settled) return;
        try {
          const res = await agentService.getCascadeTrajectory?.({ cascadeId: auxId, verbosity: 3 });
          const steps = res?.trajectory?.steps;
          if (Array.isArray(steps)) {
            handleSteps(steps, res?.status);
          }
        } catch {}
      }, 450);

      timeoutTimer = setTimeout(() => {
        if (!settled) {
          cleanup();
          if (assistantMsg.text && !assistantMsg.text.startsWith("*Réflexion")) {
            resolve();
          } else {
            reject(new Error("Délai d'attente dépassé pour la réponse auxiliaire."));
          }
        }
      }, 90000);
    });
  }

  async function submitAuxiliaryQuestion(questionText) {
    const question = (questionText || "").trim();
    if (!question || isGenerating) return;

    openAuxiliaryChat();
    const thread = getActiveThread();

    const userMsg = {
      role: "user",
      text: question,
      excerptPreview: thread.excerpt || "",
      timestamp: Date.now()
    };
    const assistantMsg = {
      role: "assistant",
      text: "",
      streaming: true,
      timestamp: Date.now()
    };

    thread.messages.push(userMsg, assistantMsg);
    saveState();
    renderMessagesList();

    activeAbortController = new AbortController();
    setGeneratingUI(true);

    try {
      await askViaNativeAgentService(thread, question, assistantMsg, activeAbortController.signal);
    } catch (err) {
      const msg = err?.message || String(err);
      assistantMsg.text = `⚠️ **Erreur** : ${msg}`;
    } finally {
      assistantMsg.streaming = false;
      activeAbortController = null;
      setGeneratingUI(false);
      saveState();
      renderMessagesList();
    }
  }

  /* ── 1. Selection "Quote" Popup Integration + Fallback Pill ──────────────── */
  let cachedSelectionText = "";
  let cachedSelectionRect = null;
  let fallbackPopupEl = null;

  function removeFallbackPopup() {
    if (fallbackPopupEl) {
      fallbackPopupEl.remove();
      fallbackPopupEl = null;
    }
  }

  function decorateNativeQuoteButton(quoteBtn) {
    if (!quoteBtn || quoteBtn.nodeType !== Node.ELEMENT_NODE) return;
    const flexRow = quoteBtn.parentElement;
    if (!flexRow) return;

    const popupRoot = quoteBtn.closest(".selection-quote-popup");
    if (popupRoot) {
      popupRoot.style.setProperty("width", "auto", "important");
      popupRoot.style.setProperty("min-width", "max-content", "important");
    }

    // If our fallback popup is open, close it since native Quote popup is active
    removeFallbackPopup();

    if (flexRow.querySelector('button[data-testid="selection-aux-ask-button"]')) return;

    const askBtn = h(
      "button",
      {
        type: "button",
        "data-testid": "selection-aux-ask-button",
        title: "Poser une question sur la sélection dans le chat auxiliaire",
        onMouseDown: (e) => {
          e.preventDefault();
          e.stopPropagation();
        },
        onPointerDown: (e) => {
          e.preventDefault();
          e.stopPropagation();
        },
        onClick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          const liveSel = window.getSelection()?.toString()?.trim() || "";
          const fiberSel = popupRoot ? getSelectionTextFromPopupFiber(popupRoot) : "";
          const chosenText = liveSel || fiberSel || cachedSelectionText;
          try {
            window.getSelection()?.removeAllRanges();
          } catch {}
          openAuxiliaryChat(chosenText);
        }
      },
      svgIcon("0 -960 960 960", ICON_CHAT_QUESTION, 13),
      h("span", {}, "Poser une question")
    );

    flexRow.appendChild(askBtn);
  }

  function showFallbackSelectionPopup(text, rect) {
    removeFallbackPopup();
    if (!text || !rect || (rect.width === 0 && rect.height === 0)) return;

    const quoteTab = h(
      "button",
      {
        type: "button",
        onMouseDown: (e) => {
          e.preventDefault();
          e.stopPropagation();
        },
        onClick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          insertQuoteIntoMainComposer(text);
          removeFallbackPopup();
          try {
            window.getSelection()?.removeAllRanges();
          } catch {}
        }
      },
      h("span", {}, "Quote")
    );

    const askTab = h(
      "button",
      {
        type: "button",
        className: "ag-aux-primary-tab",
        onMouseDown: (e) => {
          e.preventDefault();
          e.stopPropagation();
        },
        onClick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          removeFallbackPopup();
          try {
            window.getSelection()?.removeAllRanges();
          } catch {}
          openAuxiliaryChat(text);
        }
      },
      svgIcon("0 -960 960 960", ICON_CHAT_QUESTION, 13),
      h("span", {}, "Poser une question")
    );

    fallbackPopupEl = h("div", { className: "ag-aux-fallback-selection-popup" }, quoteTab, askTab);
    document.body.appendChild(fallbackPopupEl);

    const popupRect = fallbackPopupEl.getBoundingClientRect();
    let top = rect.bottom + 8;
    if (top + popupRect.height > window.innerHeight - 10) {
      top = Math.max(10, rect.top - popupRect.height - 8);
    }
    let left = rect.right - popupRect.width;
    left = Math.min(Math.max(10, left), window.innerWidth - popupRect.width - 10);

    fallbackPopupEl.style.top = `${Math.round(top)}px`;
    fallbackPopupEl.style.left = `${Math.round(left)}px`;
  }

  function setupSelectionListeners() {
    document.addEventListener("selectionchange", () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        return;
      }
      const text = sel.toString().trim();
      if (!text) return;
      const anchorEl = sel.anchorNode?.nodeType === 1 ? sel.anchorNode : sel.anchorNode?.parentElement;
      if (!anchorEl) return;
      if (anchorEl.closest("#ag-auxiliary-chat-drawer") || anchorEl.closest("input, textarea, [contenteditable='true']")) {
        return;
      }
      if (anchorEl.closest('[data-testid="conversation-view"]') || anchorEl.closest('[role="article"]')) {
        cachedSelectionText = text;
        try {
          cachedSelectionRect = sel.getRangeAt(0).getBoundingClientRect();
        } catch {}
      }
    });

    document.addEventListener("mouseup", (e) => {
      if (e.target?.closest?.(".ag-aux-fallback-selection-popup, .selection-quote-popup")) return;
      setTimeout(() => {
        const nativeBtn = document.querySelector('button[data-testid="selection-quote-button"]');
        if (nativeBtn) {
          decorateNativeQuoteButton(nativeBtn);
          removeFallbackPopup();
          return;
        }
        const sel = window.getSelection();
        const text = sel && !sel.isCollapsed ? sel.toString().trim() : "";
        if (!text) {
          removeFallbackPopup();
          return;
        }
        const anchorEl = sel.anchorNode?.nodeType === 1 ? sel.anchorNode : sel.anchorNode?.parentElement;
        if (
          anchorEl &&
          !anchorEl.closest("#ag-auxiliary-chat-drawer") &&
          !anchorEl.closest("input, textarea, [contenteditable='true']") &&
          (anchorEl.closest('[data-testid="conversation-view"]') || anchorEl.closest('[role="article"]'))
        ) {
          cachedSelectionText = text;
          const rect = sel.rangeCount > 0 ? sel.getRangeAt(0).getBoundingClientRect() : cachedSelectionRect;
          showFallbackSelectionPopup(text, rect);
        } else {
          removeFallbackPopup();
        }
      }, 45);
    });

    document.addEventListener(
      "pointerdown",
      (e) => {
        if (fallbackPopupEl && !fallbackPopupEl.contains(e.target)) {
          removeFallbackPopup();
        }
      },
      true
    );
  }

  /* ── 2. Assistant Turn Action Bar Button ─────────────────────────────────── */
  const USER_MESSAGE_SELECTOR =
    '[data-testid="user-input-step"], [role="article"][aria-label="User message"], .user-input-buttons-container';

  function extractTurnText(bar) {
    const article =
      bar.closest('[role="article"]') ||
      bar.parentElement?.closest('[role="article"]') ||
      bar.parentElement;
    if (!article) return "";
    const plannerNodes = article.querySelectorAll('[data-testid="planner-response-text"], .markdown-body');
    if (plannerNodes.length > 0) {
      return Array.from(plannerNodes)
        .map((n) => (n.textContent || "").trim())
        .filter(Boolean)
        .join("\n\n");
    }
    const clone = article.cloneNode(true);
    for (const btnBar of clone.querySelectorAll("button, .ag-aux-turn-btn")) {
      btnBar.remove();
    }
    return (clone.textContent || "").trim();
  }

  function decorateTurnBar(bar) {
    if (!bar || bar.nodeType !== Node.ELEMENT_NODE || bar.closest(USER_MESSAGE_SELECTOR)) return;

    const container =
      bar.querySelector(".flex.min-w-0.flex-wrap-reverse") ||
      bar.querySelector(".flex.min-w-0") ||
      bar.querySelector(".flex.shrink-0.items-end") ||
      bar;

    if (container.querySelector("button[data-aux-chat-turn-btn]")) return;

    const btn = h(
      "button",
      {
        type: "button",
        className: "ag-aux-turn-btn",
        "data-aux-chat-turn-btn": "true",
        title: "Poser une question sur cette réponse dans le Chat auxiliaire",
        onClick: (e) => {
          e.stopPropagation();
          const text = extractTurnText(bar);
          openAuxiliaryChat(text);
        }
      },
      svgIcon("0 -960 960 960", ICON_CHAT_QUESTION, 14),
      h("span", {}, "Poser une question")
    );

    container.appendChild(btn);
  }

  function scanPage() {
    if (!isAntigravityWorkFrame()) return;
    ensureDrawerMounted();

    // 1. Decorate native Selection Quote button if visible
    const quoteBtns = document.querySelectorAll('button[data-testid="selection-quote-button"]');
    for (const qb of quoteBtns) {
      decorateNativeQuoteButton(qb);
    }

    // 2. Decorate Assistant turn action bars
    const view = document.querySelector('[data-testid="conversation-view"]');
    if (!view) return;
    const actionBtns = view.querySelectorAll(
      'button:is([aria-label="Copy"], [aria-label="Copied"], [aria-label="Good response"], [aria-label="Bad response"])'
    );
    const turnBars = new Set();
    for (const btn of actionBtns) {
      if (btn.closest(USER_MESSAGE_SELECTOR) || btn.closest(".code-block") || btn.closest("pre")) continue;
      const bar = btn.closest(".flex.w-full.items-start") || btn.closest(".flex.min-w-0")?.parentElement;
      if (bar) turnBars.add(bar);
    }
    for (const bar of turnBars) {
      decorateTurnBar(bar);
    }
  }

  /* ── Lifecycle & Observers ───────────────────────────────────────────────── */
  let lastConvoKey = "";

  function init() {
    if (!document.body || !document.head) {
      document.addEventListener("DOMContentLoaded", init, { once: true });
      return;
    }

    ensureStyles();
    setupSelectionListeners();
    scanPage();

    // Keyboard shortcut: Alt+Q to toggle auxiliary chat (or send current selection)
    window.addEventListener("resize", () => {
      if (state.open && drawerEl) {
        updateDrawerTopOffset();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "q") {
        e.preventDefault();
        const selText = window.getSelection()?.toString()?.trim() || "";
        if (selText) {
          openAuxiliaryChat(selText);
        } else {
          toggleAuxiliaryChat();
        }
      }
    });

    // MutationObserver for instant decoration of Selection Quote popup & turn bars
    let rafId = 0;
    const observer = new MutationObserver((records) => {
      for (const rec of records) {
        for (const node of rec.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (node.getAttribute?.("data-testid") === "selection-quote-button") {
            decorateNativeQuoteButton(node);
          } else if (node.querySelector) {
            const qb = node.querySelector('button[data-testid="selection-quote-button"]');
            if (qb) decorateNativeQuoteButton(qb);
          }
        }
      }
      if (!rafId) {
        rafId = requestAnimationFrame(() => {
          rafId = 0;
          const nextKey = currentThreadKey();
          if (nextKey !== lastConvoKey) {
            lastConvoKey = nextKey;
            renderExcerptSection();
            renderMessagesList();
          }
          scanPage();
        });
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  init();
})();
