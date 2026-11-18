(() => {
  "use strict";

  // Public subscription estimate only. This never creates Stripe sessions, entitlements,
  // invoices, or Cloud resource allowances. Propodus verifies checkout eligibility.
  const $ = (id) => document.getElementById(id);
  const repositories = $("repo-count");
  const contributors = $("seat-count");
  if (!repositories || !contributors) return;

  const steps = Object.freeze({
    repository: [[3, 2], [6, 4], [10, 6]],
    contributor: [[5, 2], [10, 4], [20, 6]]
  });

  const formatUSD = new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0
  });

  // Matches the exact active Decapod Cloud tier prices in Stripe.
  // Values are cents per paid contributor–repository assignment.
  function quote(repos, people) {
    const tier = (count, levels) => levels.reduce(
      (current, [min, percent]) => count >= min ? percent : current, 0
    );
    const repoSavings = tier(repos, steps.repository);
    const peopleSavings = tier(people, steps.contributor);
    const volume = repoSavings + peopleSavings;
    const monthlyCents = 5000 - volume * 50;
    const annualCents = Math.max(48000, 55000 - volume * 600);
    const annualSavingsPercent = (60000 - annualCents) / 600;
    return {
      assignments: repos * people, repoSavings, peopleSavings, volume,
      monthlyCents, annualCents, annualSavingsPercent
    };
  }

  const elements = {
    repoValue: $("repo-count-value"),
    peopleValue: $("seat-count-value"),
    repoDiscount: $("repo-discount"),
    peopleDiscount: $("contributor-discount"),
    assignments: $("assignment-count"),
    formula: $("assignment-formula"),
    volume: $("combined-discount"),
    annual: $("annual-discount"),
    total: $("estimated-price"),
    period: $("estimate-period"),
    unit: $("estimate-unit"),
    savings: $("estimate-savings")
  };
  const billingButtons = [...document.querySelectorAll("[data-billing]")];
  let billingPeriod = "year";

  function fill(slider) {
    const min = Number(slider.min);
    const max = Number(slider.max);
    slider.style.setProperty("--fill",
      (100 * (Number(slider.value) - min) / (max - min)) + "%");
  }

  function milestones(selector, count) {
    for (const item of document.querySelectorAll(selector)) {
      const minimum = Number(item.dataset.repoThreshold ?? item.dataset.contributorThreshold);
      item.classList.toggle("is-reached", count >= minimum);
    }
  }

  function update() {
    const repos = Math.min(10, Math.max(1, Number(repositories.value) || 1));
    const people = Math.min(25, Math.max(1, Number(contributors.value) || 1));
    const q = quote(repos, people);
    const annual = billingPeriod === "year";
    const unitCents = annual ? q.annualCents : q.monthlyCents;
    const totalCents = unitCents * q.assignments;
    const baseCents = (annual ? 60000 : 5000) * q.assignments;
    const savingsCents = baseCents - totalCents;

    if (elements.repoValue) elements.repoValue.value = String(repos);
    if (elements.peopleValue) elements.peopleValue.value = String(people);
    if (elements.repoDiscount) elements.repoDiscount.textContent = "+" + q.repoSavings + "%";
    if (elements.peopleDiscount) elements.peopleDiscount.textContent = "+" + q.peopleSavings + "%";
    if (elements.assignments) elements.assignments.textContent = String(q.assignments);
    if (elements.formula) elements.formula.textContent =
      repos + " " + (repos === 1 ? "repository" : "repositories") +
      " × " + people + " " + (people === 1 ? "contributor" : "contributors") + " each";
    if (elements.volume) elements.volume.textContent = q.volume + "%";
    if (elements.annual) elements.annual.textContent = q.annualSavingsPercent.toFixed(
      Number.isInteger(q.annualSavingsPercent) ? 0 : 2) + "%";
    if (elements.total) elements.total.textContent = formatUSD.format(totalCents / 100);
    if (elements.period) elements.period.textContent = annual ? "/year" : "/month";
    if (elements.unit) elements.unit.textContent = q.assignments +
      " assignments × " + formatUSD.format(unitCents / 100) + (annual ? " per year" : " per month");
    if (elements.savings) elements.savings.textContent = annual
      ? "Save " + formatUSD.format(savingsCents / 100) + " vs. 12 monthly payments at the base list rate."
      : "Save " + formatUSD.format(savingsCents / 100) + " each month with volume pricing.";

    repositories.setAttribute("aria-valuetext", repos + " repositories, " + q.repoSavings + "% volume savings");
    contributors.setAttribute("aria-valuetext", people + " contributors, " + q.peopleSavings + "% volume savings");
    milestones("[data-repo-threshold]", repos);
    milestones("[data-contributor-threshold]", people);
    fill(repositories);
    fill(contributors);
  }

  for (const button of billingButtons) {
    button.addEventListener("click", () => {
      billingPeriod = button.dataset.billing === "month" ? "month" : "year";
      for (const item of billingButtons) {
        const selected = item.dataset.billing === billingPeriod;
        item.classList.toggle("is-selected", selected);
        item.setAttribute("aria-pressed", String(selected));
      }
      update();
    });
  }
  repositories.addEventListener("input", update);
  contributors.addEventListener("input", update);
  update();
})();
