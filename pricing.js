(() => {
  "use strict";
  // This is an informational volume/term preview, never a Cloud price quote.
  // Paid assignment edges, distinct identities, tier entitlement and billing remain server-authoritative.
  const byId = id => document.getElementById(id);
  const repositories = byId("repo-count");
  const assignmentsPerRepo = byId("seat-count");
  const uniqueContributors = byId("unique-count");
  if (!repositories || !assignmentsPerRepo || !uniqueContributors) return;
  const steps = Object.freeze({
    repos: [[3, 2], [6, 4], [10, 6]],
    people: [[5, 2], [10, 4], [20, 6]]
  });
  let annual = false;
  const tier = (value, points) => points.reduce((v, [threshold, pct]) => value >= threshold ? pct : v, 0);
  const change = (id, value, field = "textContent") => {
    const node = byId(id);
    if (node) node[field] = value;
  };
  const setFill = (slider, value) => {
    const min = Number(slider.min);
    const max = Number(slider.max);
    const fraction = max > min ? (value - min) / (max - min) : 1;
    slider.style.setProperty("--fill", (Math.max(0, Math.min(1, fraction)) * 100) + "%");
  };
  function render() {
    const repos = Math.max(1, Math.min(10, Number(repositories.value) || 1));
    const perRepo = Math.max(1, Math.min(25, Number(assignmentsPerRepo.value) || 1));
    const assignments = repos * perRepo;
    // Unique people may overlap across repos, but cannot exceed paid assignment edges.
    uniqueContributors.min = String(perRepo);
    uniqueContributors.max = String(assignments);
    const people = Math.max(perRepo, Math.min(assignments, Number(uniqueContributors.value) || perRepo));
    uniqueContributors.value = String(people);
    const r = tier(repos, steps.repos);
    const p = tier(people, steps.people);
    const volume = r + p;
    // Annual includes 8⅓ percentage points from the undiscounted annualized list;
    // volume and term savings are additive, capped at 20% on standard base licenses.
    const cumulative = Math.min(20, 100 / 12 + volume);
    change("repo-count-value", String(repos), "value");
    change("seat-count-value", String(perRepo), "value");
    change("unique-count-value", String(people), "value");
    change("assignment-count", String(assignments));
    change("assignment-formula", repos + " " + (repos === 1 ? "repository" : "repositories") + " × " + perRepo + " " + (perRepo === 1 ? "assignment" : "assignments") + " each");
    change("repo-discount", "+" + r + "%");
    change("contributor-discount", "+" + p + "%");
    change("combined-discount", volume + "%");
    change("annual-discount", Number.isInteger(cumulative) ? cumulative.toFixed(0) + "%" : cumulative.toFixed(2) + "%");
    const annualDisclosure = byId("annual-savings");
    if (annualDisclosure) annualDisclosure.hidden = !annual;

    for (const [slider, count] of [[repositories, repos], [assignmentsPerRepo, perRepo], [uniqueContributors, people]]) {
      setFill(slider, count);
    }
    for (const marker of document.querySelectorAll("[data-repo-threshold], [data-contributor-threshold]")) {
      const min = Number(marker.dataset.repoThreshold ?? marker.dataset.contributorThreshold);
      marker.classList.toggle("is-reached", (marker.dataset.repoThreshold ? repos : people) >= min);
    }
    // Marker positions reflect the available range of distinct paid humans in this example.
    for (const marker of document.querySelectorAll("[data-contributor-threshold]")) {
      const threshold = Number(marker.dataset.contributorThreshold);
      const min = Number(uniqueContributors.min);
      const max = Number(uniqueContributors.max);
      const at = max > min ? (threshold - min) / (max - min) : 0;
      const position = Math.max(0, Math.min(1, at));
      marker.style.setProperty("--tier-at", (position * 100) + "%");
      // Keep edge labels inside the slider rail at 0% and 100%.
      marker.style.transform = position === 0 ? "translateX(0)" : position === 1 ? "translateX(-100%)" : "translateX(-50%)";
      marker.style.alignItems = position === 0 ? "flex-start" : position === 1 ? "flex-end" : "center";
      marker.hidden = threshold < min || threshold > max;
    }
  }
  for (const button of document.querySelectorAll("[data-billing]")) {
    button.addEventListener("click", () => {
      annual = button.dataset.billing === "year";
      for (const option of document.querySelectorAll("[data-billing]")) {
        const selected = option.dataset.billing === (annual ? "year" : "month");
        option.classList.toggle("is-selected", selected);
        option.setAttribute("aria-pressed", String(selected));
      }
      render();
    });
  }
  for (const slider of [repositories, assignmentsPerRepo, uniqueContributors]) {
    slider.addEventListener("input", render);
  }
  render();
})();
