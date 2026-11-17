(() => {
  "use strict";
  // Public pricing mock: human/repository counts only. No billable amount, live quote,
  // tracking, network requests, Stripe integration, or activated purchase buttons.
  const repositories = document.getElementById("repo-count");
  const contributors = document.getElementById("seat-count");
  const repositoryValue = document.getElementById("repo-count-value");
  const contributorValue = document.getElementById("seat-count-value");
  const assignmentValue = document.getElementById("assignment-count");
  const assignmentFormula = document.getElementById("assignment-formula");

  if (!repositories || !contributors || !repositoryValue || !contributorValue ||
      !assignmentValue || !assignmentFormula) return;

  function fill(slider) {
    const lower = Number(slider.min);
    const upper = Number(slider.max);
    const selected = Number(slider.value);
    const progress = 100 * (selected - lower) / (upper - lower);
    slider.style.setProperty("--fill", progress + "%");
  }

  function update() {
    const repos = Math.min(10, Math.max(1, Number(repositories.value) || 1));
    const people = Math.min(25, Math.max(1, Number(contributors.value) || 1));
    repositoryValue.value = String(repos);
    contributorValue.value = String(people);
    assignmentValue.textContent = String(repos * people);
    assignmentFormula.textContent =
      repos + " " + (repos === 1 ? "repository" : "repositories") +
      " × " + people + " " + (people === 1 ? "contributor" : "contributors") + " each";
    fill(repositories);
    fill(contributors);
  }

  repositories.addEventListener("input", update);
  contributors.addEventListener("input", update);
  update();
})();
