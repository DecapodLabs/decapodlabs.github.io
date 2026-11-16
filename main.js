(() => {
  "use strict";

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

  const copy = document.getElementById("copyBtn");
  const copyStatus = document.getElementById("copyStatus");
  copy?.addEventListener("click", async () => {
    const command = "cargo binstall decapod && decapod init";
    try {
      await navigator.clipboard.writeText(command);
      copy.textContent = "COPIED ✓";
      copyStatus.textContent = "Copied. Run this inside your repository.";
    } catch {
      const node = document.getElementById("installCommand");
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(node);
      selection.removeAllRanges();
      selection.addRange(range);
      copyStatus.textContent = "Select and copy the highlighted command.";
    }
  });

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
