(() => {
  "use strict";

  // The product video is a silent, looping visual—no playback UI.
  const video = document.getElementById("filmVideo");
  if (video) {
    video.muted = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      video.removeAttribute("autoplay");
      video.pause();
    } else {
      video.play().catch(() => {
        // Preserve the poster when a browser blocks autoplay.
      });
    }
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
