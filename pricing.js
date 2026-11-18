(() => {
  "use strict";
  // Marketing preview only: paid assignments and distinct-human volume tiers
  // are server-verified at purchase. The second slider shows the minimum
  // distinct people implied by equal-sized repository assignment counts.
  const byId = id => document.getElementById(id);
  const repositories = byId("repo-count");
  const contributors = byId("seat-count");
  if (!repositories || !contributors) return;
  const steps = Object.freeze({
    repos: [[3, 2], [6, 4], [10, 6]],
    people: [[5, 2], [10, 4], [20, 6]]
  });
  let annual = false;
  let showAnnualDetails = false;
  const tier = (count, points) => points.reduce(
    (amount, [minimum, discount]) => count >= minimum ? discount : amount, 0
  );
  const change = (id, value, property = "textContent") => {
    const node = byId(id);
    if (node) node[property] = value;
  };
  function render() {
    const repos = Math.max(1, Math.min(10, Number(repositories.value) || 1));
    const perRepo = Math.max(1, Math.min(25, Number(contributors.value) || 1));
    const repoDiscount = tier(repos, steps.repos);
    // Every repository with N people implies at least N distinct humans.
    // More non-overlapping humans may increase the actual verified discount.
    const peopleDiscountFloor = tier(perRepo, steps.people);
    const volumeFloor = repoDiscount + peopleDiscountFloor;
    const annualUncapped = 100 / 12 + volumeFloor;
    const annualFloor = Math.min(20, annualUncapped);

    change("repo-count-value", String(repos), "value");
    change("seat-count-value", String(perRepo), "value");
    change("assignment-count", String(repos * perRepo));
    change("assignment-formula", repos + " " + (repos === 1 ? "repository" : "repositories") +
      " × " + perRepo + " " + (perRepo === 1 ? "contributor" : "contributors") + " each");
    change("repo-discount", "+" + repoDiscount + "%");
    change("contributor-discount", "+" + peopleDiscountFloor + "%");
    change("combined-discount", volumeFloor + "%");
    change("annual-volume", volumeFloor + "%");
    change("annual-discount", (Number.isInteger(annualFloor) ?
      annualFloor.toFixed(0) : annualFloor.toFixed(2)) + "%");
    const capNote = byId("annual-cap-note");
    if (capNote) capNote.hidden = annualUncapped <= 20;

    const disclosure = byId("annual-savings");
    if (disclosure) disclosure.hidden = !annual || !showAnnualDetails;
    for (const option of document.querySelectorAll("[data-billing]")) {
      const selected = option.dataset.billing === (annual ? "year" : "month");
      option.classList.toggle("is-selected", selected);
      option.setAttribute("aria-pressed", String(selected));
      if (option.dataset.billing === "year") {
        option.setAttribute("aria-expanded", String(annual && showAnnualDetails));
      }
    }
    for (const [slider, value, selector] of [
      [repositories, repos, "[data-repo-threshold]"],
      [contributors, perRepo, "[data-contributor-threshold]"]
    ]) {
      const fraction = (value - Number(slider.min)) / (Number(slider.max) - Number(slider.min));
      slider.style.setProperty("--fill", (Math.max(0, Math.min(1, fraction)) * 100) + "%");
      for (const marker of document.querySelectorAll(selector)) {
        const threshold = Number(marker.dataset.repoThreshold ?? marker.dataset.contributorThreshold);
        marker.classList.toggle("is-reached", value >= threshold);
      }
    }
  }
  for (const option of document.querySelectorAll("[data-billing]")) {
    option.addEventListener("click", () => {
      annual = option.dataset.billing === "year";
      showAnnualDetails = annual;
      render();
    });
  }
  const dismiss = byId("annual-dismiss");
  if (dismiss) dismiss.addEventListener("click", () => {
    showAnnualDetails = false;
    render();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && showAnnualDetails) {
      showAnnualDetails = false;
      render();
      const annualButton = [...document.querySelectorAll("[data-billing]")].find(
        button => button.dataset.billing === "year"
      );
      if (annualButton) annualButton.focus();
    }
  });
  repositories.addEventListener("input", render);
  contributors.addEventListener("input", render);
  render();
})();
