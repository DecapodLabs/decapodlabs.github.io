(() => {
  "use strict";
  // Preview exposes team size and discount milestones, never unpublished prices.
  // Stripe pricing and entitlements are always controlled by authenticated Propodus.
  const byId = id => document.getElementById(id);
  const repositories = byId("repo-count");
  const contributors = byId("seat-count");
  if (!repositories || !contributors) return;
  const steps = Object.freeze({
    repos: [[3,2],[6,4],[10,6]],
    people: [[5,2],[10,4],[20,6]]
  });
  let annual = true;
  const tier = (value, points) => points.reduce((v,[threshold,pct]) => value >= threshold ? pct : v, 0);
  function render() {
    const repos = Math.max(1, Math.min(10, Number(repositories.value)||1));
    const people = Math.max(1, Math.min(25, Number(contributors.value)||1));
    const r = tier(repos,steps.repos), p = tier(people,steps.people);
    const volume = r+p;
    // Annual term is one month free; combined savings are capped at 20%.
    const cumulative = Math.min(20, 100/12+volume);
    const change = (id,value,field="textContent") => {const node=byId(id);if(node) node[field]=value;};
    change("repo-count-value",String(repos),"value");
    change("seat-count-value",String(people),"value");
    change("assignment-count",String(repos*people));
    change("assignment-formula",repos+" "+(repos===1?"repository":"repositories")+" × "+people+" "+(people===1?"contributor":"contributors")+" each");
    change("repo-discount","+"+r+"%");
    change("contributor-discount","+"+p+"%");
    change("combined-discount",volume+"%");
    change("annual-discount",(Number.isInteger(cumulative)?cumulative.toFixed(0):cumulative.toFixed(2))+"%");
    change("estimate-period",annual?"/year":"/month");
    change("estimate-unit",String(repos*people)+" contributor–repository assignments");
    change("estimate-savings",annual?"Annual commitment and volume savings are cumulative.":"Volume savings grow with your team.");
    change("estimated-price","☁");
    for(const [slider,count,selector] of [[repositories,repos,"[data-repo-threshold]"],[contributors,people,"[data-contributor-threshold]"]]) {
      const fraction=(count-Number(slider.min))/(Number(slider.max)-Number(slider.min));
      slider.style.setProperty("--fill",(fraction*100)+"%");
      for(const marker of document.querySelectorAll(selector)) {
        const min=Number(marker.dataset.repoThreshold ?? marker.dataset.contributorThreshold);
        marker.classList.toggle("is-reached",count>=min);
      }
    }
  }
  for(const button of document.querySelectorAll("[data-billing]")) {
    button.addEventListener("click",()=>{
      annual=button.dataset.billing==="year";
      for(const option of document.querySelectorAll("[data-billing]")) {
        const selected=option.dataset.billing===(annual?"year":"month");
        option.classList.toggle("is-selected",selected);
        option.setAttribute("aria-pressed",String(selected));
      }
      render();
    });
  }
  repositories.addEventListener("input",render);
  contributors.addEventListener("input",render);
  render();
})();
