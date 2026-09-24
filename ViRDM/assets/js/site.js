function demoPrompts() {
  if (!Array.isArray(window.VIRDM_PROMPTS) || window.VIRDM_PROMPTS.length < 100) {
    throw new Error("The local prompt manifest is missing or incomplete");
  }
  return window.VIRDM_PROMPTS;
}

document.querySelector("#copy-bibtex").addEventListener("click", async event => {
  const button = event.currentTarget;
  await navigator.clipboard.writeText(document.querySelector("#bibtex").textContent);
  button.textContent = "Copied";
  setTimeout(() => { button.textContent = "Copy"; }, 1400);
});

async function renderShowcase() {
  const root = document.querySelector("#showcase-grid");
  const toggle = document.querySelector("#showcase-toggle");
  if (!root) return;

  const showcaseIndices = [
    78, 68, 84, 92, 58, 72, 87, 86, 60, 39,
    97, 64, 89, 16, 52, 50, 20, 98, 27, 48,
    57, 36, 35, 43, 47, 76, 42,
    23, 34, 70
  ];

  try {
    const prompts = demoPrompts();
    const cards = showcaseIndices.map((sourceIndex, cardIndex) => {
      const index = String(sourceIndex).padStart(4, "0");
      const card = document.createElement("article");
      card.className = `showcase-video${cardIndex > 8 ? " is-collapsed" : ""}`;
      card.dataset.prompt = prompts[sourceIndex];

      const video = document.createElement("video");
      video.src = `assets/videos/showcase/${index}.mp4`;
      video.controls = true;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = cardIndex < 9 ? "metadata" : "none";
      video.autoplay = cardIndex < 9;
      video.setAttribute("aria-label", `ViRDM showcase: ${prompts[sourceIndex]}`);
      card.append(video);
      return card;
    });
    root.replaceChildren(...cards);

    if (toggle) {
      toggle.addEventListener("click", () => {
        const expanded = toggle.getAttribute("aria-expanded") === "true";
        cards.slice(9).forEach(card => {
          card.classList.toggle("is-collapsed", expanded);
          const video = card.querySelector("video");
          if (expanded) video.pause();
          else {
            video.preload = "metadata";
            video.play().catch(() => {});
          }
        });
        toggle.setAttribute("aria-expanded", String(!expanded));
        toggle.textContent = expanded ? "Show all 30" : "Show fewer";
      });
    }
  } catch (error) {
    const message = document.createElement("p");
    message.className = "results-candidate-error";
    message.textContent = "Showcase videos could not be loaded.";
    root.replaceChildren(message);
    if (toggle) toggle.hidden = true;
    console.error(error);
  }
}

renderShowcase();

function renderDynamicsComparison() {
  const root = document.querySelector("#dynamics-compare-grid");
  const toggle = document.querySelector("#dynamics-compare-toggle");
  if (!root) return;

  const sourceIndices = [34, 47, 2, 7, 15, 22, 26, 28, 0, 1];
  const methods = [
    { id: "ours_no_raft", label: "ViRDM w/o Dyn. Reg." },
    { id: "ours_raft5e4", label: "ViRDM w/ Dyn. Reg.", regularized: true }
  ];

  try {
    const prompts = demoPrompts();
    const comparisonCases = [
      {
        prompt: prompts[3],
        videos: {
          ours_no_raft: "assets/videos/representation/video/rainforest.mp4",
          ours_raft5e4: "assets/videos/representation/video_dyn/rainforest.mp4"
        }
      },
      {
        prompt: prompts[13],
        videos: {
          ours_no_raft: "assets/videos/representation/video/moorland.mp4",
          ours_raft5e4: "assets/videos/representation/video_dyn/moorland.mp4"
        }
      },
      ...sourceIndices.map(sourceIndex => {
        const index = String(sourceIndex).padStart(4, "0");
        return {
          prompt: prompts[sourceIndex],
          videos: {
            ours_no_raft: `assets/videos/dynamics_compare/ours_no_raft/${index}.mp4`,
            ours_raft5e4: `assets/videos/dynamics_compare/ours_raft5e4/${index}.mp4`
          }
        };
      })
    ];

    const cases = comparisonCases.map((item, caseIndex) => {
      const group = document.createElement("section");
      group.className = `dynamics-compare-case${caseIndex > 3 ? " is-collapsed" : ""}`;

      const grid = document.createElement("div");
      grid.className = "dynamics-compare-case-grid";
      methods.forEach(method => {
        const card = document.createElement("article");
        card.className = `figure4-video-item ${method.regularized ? "regularized" : "plain"}`;
        card.dataset.method = method.label;
        card.dataset.prompt = item.prompt;

        const video = document.createElement("video");
        video.src = item.videos[method.id];
        video.controls = true;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.autoplay = caseIndex < 4;
        video.preload = caseIndex < 4 ? "metadata" : "none";
        video.setAttribute("aria-label", `${method.label}, comparison ${caseIndex + 1}: ${item.prompt}`);

        card.append(video);
        grid.append(card);
      });

      group.append(grid);
      return group;
    });

    root.replaceChildren(...cases);
    if (toggle) {
      toggle.hidden = false;
      toggle.addEventListener("click", () => {
        const expanded = toggle.getAttribute("aria-expanded") === "true";
        cases.slice(4).forEach(group => {
          group.classList.toggle("is-collapsed", expanded);
          group.querySelectorAll("video").forEach(video => {
            if (expanded) video.pause();
            else {
              video.preload = "metadata";
              video.play().catch(() => {});
            }
          });
        });
        toggle.setAttribute("aria-expanded", String(!expanded));
        toggle.textContent = expanded ? "Show all" : "Show less";
      });
    }
  } catch (error) {
    const message = document.createElement("p");
    message.className = "results-candidate-error";
    message.textContent = "Dynamics comparison videos could not be loaded.";
    root.replaceChildren(message);
    if (toggle) toggle.hidden = true;
    console.error(error);
  }
}

renderDynamicsComparison();

async function renderResultsCandidates() {
  const root = document.querySelector("#results-candidate-grid");
  const toggle = document.querySelector("#results-candidate-toggle");
  if (!root) return;

  const selectedIndices = [19, 79, 99, 37, 4, 8, 29, 32, 33];

  const methods = [
    { id: "causvid_shift5", label: "CausVid" },
    { id: "self_forcing", label: "Self-Forcing" },
    { id: "causal_forcing", label: "Causal Forcing" },
    { id: "ours_raft5e4", label: "ViRDM", ours: true }
  ];

  try {
    const prompts = demoPrompts();
    const selectedCases = selectedIndices.map(sourceIndex => ({
      source_index_0based: sourceIndex,
      prompt: prompts[sourceIndex]
    }));
    if (selectedCases.some(item => !item.prompt)) throw new Error("A selected prompt is missing");

    const cases = selectedCases.map((item, caseIndex) => {
      const index = String(item.source_index_0based).padStart(4, "0");
      const group = document.createElement("section");
      group.className = `results-candidate-case${caseIndex > 3 ? " is-collapsed" : ""}`;

      const grid = document.createElement("div");
      grid.className = "results-candidate-case-grid";
      methods.forEach(method => {
        const card = document.createElement("article");
        card.className = `results-candidate${method.ours ? " ours" : ""}`;
        card.dataset.prompt = item.prompt;

        const badge = document.createElement("span");
        badge.className = "results-candidate-method";
        badge.textContent = method.label;

        const video = document.createElement("video");
        video.src = `assets/videos/results_candidates/${method.id}/${index}.mp4`;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.autoplay = true;
        video.preload = "metadata";
        video.controls = true;
        video.setAttribute("aria-label", `${method.label}, example ${item.source_index_0based}: ${item.prompt}`);

        card.append(badge, video);
        grid.append(card);
      });

      group.append(grid);
      return group;
    });
    root.replaceChildren(...cases);

    if (toggle) {
      toggle.hidden = false;
      toggle.addEventListener("click", () => {
        const expanded = toggle.getAttribute("aria-expanded") === "true";
        cases.slice(4).forEach(group => group.classList.toggle("is-collapsed", expanded));
        toggle.setAttribute("aria-expanded", String(!expanded));
        toggle.textContent = expanded ? "Show all" : "Show less";
      });
    }
  } catch (error) {
    const message = document.createElement("p");
    message.className = "results-candidate-error";
    message.textContent = "Comparison videos could not be loaded.";
    root.replaceChildren(message);
    if (toggle) toggle.hidden = true;
    console.error(error);
  }
}

renderResultsCandidates();

async function renderBidirectionalExtension() {
  const root = document.querySelector("#bidirectional-extension-videos");
  if (!root) return;
  const indices = [74, 75, 93, 77, 57, 78];

  try {
    const prompts = demoPrompts();
    const cards = indices.map(sourceIndex => {
      const index = String(sourceIndex).padStart(4, "0");
      const card = document.createElement("article");
      card.className = "bidirectional-extension-video";
      card.dataset.prompt = prompts[sourceIndex];

      const video = document.createElement("video");
      video.src = `assets/videos/bidirectional_4step/${index}.mp4`;
      video.controls = true;
      video.muted = true;
      video.loop = true;
      video.autoplay = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.setAttribute("aria-label", `Four-step bidirectional generation ${sourceIndex}: ${prompts[sourceIndex]}`);
      card.append(video);
      return card;
    });
    root.replaceChildren(...cards);
  } catch (error) {
    const message = document.createElement("p");
    message.className = "results-candidate-error";
    message.textContent = "Bidirectional examples could not be loaded.";
    root.replaceChildren(message);
    console.error(error);
  }
}

renderBidirectionalExtension();

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    entry.target.classList.toggle("in-view", entry.isIntersecting);
  });
}, { threshold: 0.12 });
document.querySelectorAll(".finding, .resource-grid article, .extension-grid article").forEach(node => observer.observe(node));

function initFloatingToc() {
  const toc = document.querySelector(".floating-toc");
  if (!toc) return;

  const links = [...toc.querySelectorAll("a[data-section]")];
  const sections = links.map(link => document.getElementById(link.dataset.section));
  const current = document.querySelector("#toc-current");
  const progress = document.querySelector("#toc-progress");
  let ticking = false;

  const update = () => {
    const marker = window.innerHeight * 0.34;
    let activeIndex = 0;

    sections.forEach((section, index) => {
      if (section && section.getBoundingClientRect().top <= marker) activeIndex = index;
    });

    links.forEach((link, index) => {
      const active = index === activeIndex;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });

    if (current) current.textContent = String(activeIndex + 1).padStart(2, "0");
    if (progress) progress.style.height = `${((activeIndex + 1) / links.length) * 100}%`;
    ticking = false;
  };

  const requestUpdate = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(update);
  };

  update();
  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate);
}

initFloatingToc();
