(() => {
  "use strict";

  const sectionLinks = document.querySelectorAll('.nav-links a[href^="/#"]');
  function syncCurrentSection() {
    const currentSection = "/" + window.location.hash;
    for (const link of sectionLinks) {
      if (link.getAttribute("href") === currentSection) {
        link.setAttribute("aria-current", "location");
      } else {
        link.removeAttribute("aria-current");
      }
    }
  }
  syncCurrentSection();
  window.addEventListener("hashchange", syncCurrentSection);

  const film = document.getElementById("filmVideo");
  const replay = document.getElementById("soundBtn");
  const replayLabel = document.getElementById("soundLabel");
  const pause = document.getElementById("pauseBtn");
  const pauseLabel = document.getElementById("pauseLabel");
  const pauseIcon = document.getElementById("pauseIcon");
  const mute = document.getElementById("muteBtn");
  const muteLabel = document.getElementById("muteLabel");
  const muteIcon = document.getElementById("muteIcon");

  if (film) {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function syncPlaybackControls() {
      const playing = !film.paused && !film.ended;
      if (pauseLabel) pauseLabel.textContent = playing ? "Pause" : "Play";
      if (pauseIcon) pauseIcon.textContent = playing ? "Ⅱ" : "▶";
      if (pause) pause.setAttribute("aria-label", playing ? "Pause film" : "Play film");
      if (muteLabel) muteLabel.textContent = film.muted ? "Unmute" : "Mute";
      if (muteIcon) muteIcon.textContent = film.muted ? "♪" : "♫";
      if (mute) mute.setAttribute("aria-label", film.muted ? "Unmute film" : "Mute film");
    }

    film.muted = true;
    if (reducedMotion) {
      film.removeAttribute("autoplay");
      film.pause();
    } else {
      film.play().catch(() => {
        // Browsers may block autoplay; the Play button remains available.
        syncPlaybackControls();
      });
    }

    for (const event of ["play", "pause", "ended", "volumechange", "loadedmetadata"]) {
      film.addEventListener(event, syncPlaybackControls);
    }

    replay?.addEventListener("click", async () => {
      film.muted = false;
      film.currentTime = 0;
      try {
        await film.play();
        if (replayLabel) replayLabel.textContent = "Replay with sound";
      } catch {
        film.controls = true;
        if (replayLabel) replayLabel.textContent = "Use video controls";
      }
      syncPlaybackControls();
    });

    pause?.addEventListener("click", async () => {
      if (film.paused) {
        try {
          await film.play();
        } catch {
          film.controls = true;
        }
      } else {
        film.pause();
      }
      syncPlaybackControls();
    });

    mute?.addEventListener("click", () => {
      film.muted = !film.muted;
      syncPlaybackControls();
    });

    syncPlaybackControls();
  }

  const installCommands = Object.freeze({
    cargo: "cargo binstall decapod && decapod init",
    nix: [
      "nix run nixpkgs#cachix -- use decapod &&",
      "nix profile install github:DecapodLabs/decapod &&",
      "decapod init"
    ].join("\n")
  });

  const copy = document.getElementById("copyBtn");
  const copyStatus = document.getElementById("copyStatus");
  const commandNode = document.getElementById("installCommand");
  const cargoButton = document.getElementById("installCargo");
  const nixButton = document.getElementById("installNix");
  const sourceLink = document.getElementById("installSource");
  let selectedInstall = "cargo";

  function selectInstall(method) {
    if (!Object.prototype.hasOwnProperty.call(installCommands, method)) return;
    selectedInstall = method;
    if (commandNode) commandNode.textContent = installCommands[method];
    cargoButton?.classList.toggle("is-active", method === "cargo");
    nixButton?.classList.toggle("is-active", method === "nix");
    cargoButton?.setAttribute("aria-pressed", String(method === "cargo"));
    nixButton?.setAttribute("aria-pressed", String(method === "nix"));
    if (sourceLink) {
      sourceLink.href = method === "nix"
        ? "https://app.cachix.org/organization/decapodlabs/cache/decapod#pull"
        : "https://crates.io/crates/decapod";
      sourceLink.textContent = method === "nix" ? "Decapod Cachix ↗" : "Crates.io ↗";
    }
    if (copy) copy.textContent = "COPY";
    if (copyStatus) copyStatus.textContent = method === "nix"
      ? "Requires Nix with flakes enabled. Initializes once per project."
      : "One initialization per project.";
  }

  cargoButton?.addEventListener("click", () => selectInstall("cargo"));
  nixButton?.addEventListener("click", () => selectInstall("nix"));

  copy?.addEventListener("click", async () => {
    const command = installCommands[selectedInstall];
    try {
      await navigator.clipboard.writeText(command);
      copy.textContent = "COPIED ✓";
      copyStatus.textContent = "Copied. Run this inside your repository.";
    } catch {
      if (!commandNode) return;
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(commandNode);
      selection.removeAllRanges();
      selection.addRange(range);
      copyStatus.textContent = "Select and copy the highlighted command.";
    }
  });

  const proofVideo = document.getElementById("proofVideo");
  for (const chapter of document.querySelectorAll("[data-proof-seek]")) {
    chapter.addEventListener("click", event => {
      if (!proofVideo || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const seconds = Number(chapter.dataset.proofSeek);
      if (!(seconds > 0)) return;
      event.preventDefault();
      proofVideo.currentTime = seconds;
      proofVideo.scrollIntoView({block: "center"});
      proofVideo.play().catch(() => {});
    });
  }
  // Three separate Ghostty / Antigravity CLI swarms, presented as an inspectable stack.
  const swarm = document.querySelector("[data-swarm-carousel]");
  if (swarm) {
    const deck = swarm.querySelector(".swarm-deck");
    const cards = Array.from(swarm.querySelectorAll("[data-swarm-slide]"));
    const dots = Array.from(swarm.querySelectorAll("[data-swarm-go]"));
    const counter = swarm.querySelector("[data-swarm-number]");
    const label = swarm.querySelector("[data-swarm-label]");
    const title = swarm.querySelector("[data-swarm-title]");
    const body = swarm.querySelector("[data-swarm-body]");
    const full = swarm.querySelector("[data-swarm-full]");
    const slides = [
      {label:"DECAPOD KERNEL",title:"Issues in motion.",body:"Parallel issue work, revalidation after upstream merges, and independent verification."},
      {label:"DECAPOD DELIVERY",title:"Checks before merges.",body:"Review, governed publication, and merge coordination across multiple active issues."},
      {label:"PROPODUS DELIVERY",title:"Product work ships.",body:"Billing, identity, limits, and deployment work moving in parallel with validation and review."}
    ];
    let current = 0;
    let wheelAt = 0;
    let touchStart = null;
    let suppressClickUntil = 0;
    function renderSwarm(next) {
      current = (next + cards.length) % cards.length;
      cards.forEach((card, i) => {
        const position = (i - current + cards.length) % cards.length;
        card.classList.toggle("is-active", position === 0);
        card.classList.toggle("is-next", position === 1);
        card.classList.toggle("is-prev", position === 2);
        card.setAttribute("aria-hidden", String(position !== 0));
        card.tabIndex = position === 0 ? 0 : -1;
      });
      dots.forEach((dot, i) => {
        dot.classList.toggle("is-active", i === current);
        dot.setAttribute("aria-pressed", String(i === current));
      });
      counter.textContent = String(current + 1).padStart(2, "0") + " / 03";
      label.textContent = slides[current].label;
      title.textContent = slides[current].title;
      body.textContent = slides[current].body;
      full.href = cards[current].href;
    }
    swarm.classList.add("is-enhanced");
    renderSwarm(0);
    swarm.querySelector("[data-swarm-prev]")?.addEventListener("click", () => renderSwarm(current - 1));
    swarm.querySelector("[data-swarm-next]")?.addEventListener("click", () => renderSwarm(current + 1));
    dots.forEach((dot, i) => dot.addEventListener("click", () => renderSwarm(i)));
    cards.forEach((card, i) => card.addEventListener("click", event => {
      if (Date.now() < suppressClickUntil || current !== i) {
        event.preventDefault();
        if (Date.now() >= suppressClickUntil) renderSwarm(i);
      }
    }));
    deck.addEventListener("keydown", event => {
      if (event.key === "ArrowRight") { event.preventDefault(); renderSwarm(current + 1); }
      if (event.key === "ArrowLeft") { event.preventDefault(); renderSwarm(current - 1); }
      if (event.key === "Home") { event.preventDefault(); renderSwarm(0); }
      if (event.key === "End") { event.preventDefault(); renderSwarm(cards.length - 1); }
    });
    deck.addEventListener("wheel", event => {
      if (Math.abs(event.deltaY) < 8 || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      const next = current + (event.deltaY > 0 ? 1 : -1);
      // Release scrolling at either end; never trap the visitor inside the carousel.
      if (next < 0 || next >= cards.length) return;
      event.preventDefault();
      const now = Date.now();
      if (now - wheelAt < 480) return;
      wheelAt = now;
      renderSwarm(next);
    }, {passive:false});
    deck.addEventListener("touchstart", event => {
      if (event.touches.length !== 1) return;
      touchStart = {x:event.touches[0].clientX,y:event.touches[0].clientY};
    }, {passive:true});
    deck.addEventListener("touchend", event => {
      if (!touchStart || !event.changedTouches.length) return;
      const dx = event.changedTouches[0].clientX - touchStart.x;
      const dy = event.changedTouches[0].clientY - touchStart.y;
      touchStart = null;
      if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
      suppressClickUntil = Date.now() + 380;
      renderSwarm(current + (dx < 0 ? 1 : -1));
    }, {passive:true});
  }


  // Source screenshots from the WAYSTEAD development build. No external carousel dependency.
  const showcase = document.querySelector("[data-showcase-carousel]");
  if (showcase) {
    const slides = [...showcase.querySelectorAll("[data-showcase-slide]")];
    const dots = [...showcase.querySelectorAll("[data-showcase-go]")];
    const details = [
      ["A character of your own.","Character creation, appearance, identity, and the start of a personal journey."],
      ["A world to explore.","Playable terrain, vegetation, camera movement, and a persistent character."],
      ["Geography with depth.","Procedurally realized environments viewed at multiple scales."],
      ["History worth keeping.","Observation and discovery become lasting records in the player's journal."],
      ["Survive. Build. Continue.","Survival systems, resource constraints, and construction options."],
      ["A connected survival system.","Equipment, inventory, resources, and crafting belong to one persistent simulation."],
      ["By the water.","A playable character among trees, grasses, and water in the developing world."]
    ];
    const stage = showcase.querySelector(".showcase-gallery-stage");
    const title = showcase.querySelector("[data-showcase-title]");
    const caption = showcase.querySelector("[data-showcase-description]");
    const counter = showcase.querySelector("[data-showcase-count]");
    const topline = showcase.querySelector(".showcase-gallery-topline span:last-child");
    const fullImageLink = showcase.querySelector("[data-showcase-full]");
    const imageFiles = ["character","exploration","landscape","journal","construction","inventory","waterside"];
    let current = 0;
    function choose(index) {
      current = (index + slides.length) % slides.length;
      slides.forEach((slide, i) => {
        const active = i === current;
        slide.hidden = !active;
        slide.classList.toggle("is-active", active);
      });
      dots.forEach((dot, i) => {
        dot.classList.toggle("is-active", i === current);
        dot.setAttribute("aria-pressed", String(i === current));
      });
      const number = String(current + 1).padStart(2, "0") + " / " + String(slides.length).padStart(2, "0");
      if (counter) counter.textContent = number + " · IN DEVELOPMENT";
      if (topline) topline.textContent = number;
      if (title) title.textContent = details[current][0];
      if (caption) caption.textContent = details[current][1];
      if (fullImageLink) fullImageLink.href = "assets/waystead-" + imageFiles[current] + ".webp";
    }
    showcase.querySelector("[data-showcase-prev]")?.addEventListener("click", () => choose(current - 1));
    showcase.querySelector("[data-showcase-next]")?.addEventListener("click", () => choose(current + 1));
    dots.forEach((dot, i) => dot.addEventListener("click", () => choose(i)));
    stage?.addEventListener("keydown", event => {
      if (event.key === "ArrowLeft") { event.preventDefault(); choose(current - 1); }
      if (event.key === "ArrowRight") { event.preventDefault(); choose(current + 1); }
      if (event.key === "Home") { event.preventDefault(); choose(0); }
      if (event.key === "End") { event.preventDefault(); choose(slides.length - 1); }
    });
    let touchX = null;
    stage?.addEventListener("touchstart", event => {
      if (event.touches.length === 1) touchX = event.touches[0].clientX;
    }, {passive:true});
    stage?.addEventListener("touchend", event => {
      if (touchX === null || !event.changedTouches.length) return;
      const delta = event.changedTouches[0].clientX - touchX;
      touchX = null;
      if (Math.abs(delta) > 48) choose(current + (delta < 0 ? 1 : -1));
    }, {passive:true});
    choose(0);
  }

  const revealed = document.querySelectorAll("[data-reveal]");
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("revealed");
          observer.unobserve(entry.target);
        }
      }
    }, { threshold: 0.09 });
    revealed.forEach(element => observer.observe(element));
  } else {
    revealed.forEach(element => element.classList.add("revealed"));
  }

  const progress = document.getElementById("scrollProgress");
  let ticking = false;
  addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const height = document.documentElement.scrollHeight - innerHeight;
      progress.style.width = (height > 0 ? scrollY / height * 100 : 0) + "%";
      ticking = false;
    });
  }, { passive: true });

  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();
})();
