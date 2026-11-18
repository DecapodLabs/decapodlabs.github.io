(() => {
  "use strict";
  // Public Coming soon mock. This file never computes money, generates Stripe sessions,
  // sets commercial entitlements, or derives real provider usage limits.
  const byId = (id) => document.getElementById(id);
  const repositories = byId("repo-count");
  const contributors = byId("seat-count");
  const repositoryValue = byId("repo-count-value");
  const contributorValue = byId("seat-count-value");
  const assignmentValue = byId("assignment-count");
  const assignmentFormula = byId("assignment-formula");
  const repositoryDiscount = byId("repo-discount");
  const contributorDiscount = byId("contributor-discount");
  const combinedDiscount = byId("combined-discount");
  const annualDiscount = byId("annual-discount");
  const resourceInputs = [
    ["network-capacity", "network-capacity-value"],
    ["compute-capacity", "compute-capacity-value"],
    ["storage-capacity", "storage-capacity-value"]
  ];
  const capacitySummary = byId("capacity-summary");

  if (!repositories || !contributors || !repositoryValue || !contributorValue ||
      !assignmentValue || !assignmentFormula) return;

  // Illustrative 2/4/6-point discounts on each independently selected axis.
  // The service will own all actual eligibility, cost validation, and invoice math.
  const repositorySteps = Object.freeze([[3, 2], [6, 4], [10, 6]]);
  const contributorSteps = Object.freeze([[5, 2], [10, 4], [20, 6]]);

  function stepPercent(count, steps) {
    let percent = 0;
    for (const [minimum, value] of steps) {
      if (count >= minimum) percent = value;
    }
    return percent;
  }

  function fill(slider) {
    const min = Number(slider.min);
    const max = Number(slider.max);
    const value = Number(slider.value);
    if (max <= min) return;
    const progress = 100 * (value - min) / (max - min);
    slider.style.setProperty("--fill", progress + "%");
  }

  function paintMilestones(selector, count) {
    const nodes = document.querySelectorAll(selector);
    for (const item of nodes) {
      const min = Number(item.dataset.repoThreshold ?? item.dataset.contributorThreshold);
      item.classList.toggle("is-reached", count >= min);
    }
  }

  function updateAssignments() {
    const repos = Math.min(10, Math.max(1, Number(repositories.value) || 1));
    const people = Math.min(25, Math.max(1, Number(contributors.value) || 1));

    repositoryValue.value = String(repos);
    contributorValue.value = String(people);
    assignmentValue.textContent = String(repos * people);
    assignmentFormula.textContent =
      repos + " " + (repos === 1 ? "repository" : "repositories") +
      " × " + people + " " + (people === 1 ? "contributor" : "contributors") + " each";

    // The mock deliberately assumes the same distinct human group across all repos.
    // We count these humans once for the contributor-volume axis, NOT repos * humans.
    const repoPercent = stepPercent(repos, repositorySteps);
    const peoplePercent = stepPercent(people, contributorSteps);
    const volume = repoPercent + peoplePercent;
    // Annual $550 base saves one month from the unmodified $600 annualized list.
    // Add volume percentage points against that same list, capped at 20%.
    const annualTotal = Math.min(20, 100 / 12 + volume);
    if (repositoryDiscount) repositoryDiscount.textContent = "+" + repoPercent + "%";
    if (contributorDiscount) contributorDiscount.textContent = "+" + peoplePercent + "%";
    if (combinedDiscount) combinedDiscount.textContent = volume + "%";
    if (annualDiscount) annualDiscount.textContent =
      (Number.isInteger(annualTotal) ? annualTotal.toFixed(0) : annualTotal.toFixed(2)) + "%";

    paintMilestones("[data-repo-threshold]", repos);
    paintMilestones("[data-contributor-threshold]", people);
    fill(repositories);
    fill(contributors);
  }

  function updateCapacity() {
    let extra = 0;
    for (const [inputId, outputId] of resourceInputs) {
      const slider = byId(inputId);
      const output = byId(outputId);
      if (!slider || !output) continue;
      const ratio = Math.min(300, Math.max(100, Number(slider.value) || 100));
      const aboveBaseline = ratio - 100;
      output.value = aboveBaseline === 0 ? "Included" : "+" + aboveBaseline + "%";
      if (aboveBaseline > 0) extra += 1;
      fill(slider);
    }
    if (capacitySummary) {
      capacitySummary.textContent = extra === 0
        ? "All resources within included capacity"
        : extra + " resource " + (extra === 1 ? "category" : "categories") +
          " above baseline — prepaid capacity required";
    }
  }

  repositories.addEventListener("input", updateAssignments);
  contributors.addEventListener("input", updateAssignments);
  for (const [id] of resourceInputs) byId(id)?.addEventListener("input", updateCapacity);
  updateAssignments();
  updateCapacity();
})();
