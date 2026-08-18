document.addEventListener('DOMContentLoaded', () => {
  const burger = document.querySelector('.navbar-burger');
  const menu = document.getElementById(burger?.dataset.target);

  if (burger && menu) {
    burger.addEventListener('click', () => {
      const isActive = burger.classList.toggle('is-active');
      menu.classList.toggle('is-active', isActive);
      burger.setAttribute('aria-expanded', String(isActive));
    });

    menu.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        burger.classList.remove('is-active');
        menu.classList.remove('is-active');
        burger.setAttribute('aria-expanded', 'false');
      });
    });
  }

  const chapterViewer = document.querySelector('[data-video-chapters]');
  if (chapterViewer) {
    const tabs = Array.from(document.querySelectorAll('.chapter-tab'));
    const panels = Array.from(chapterViewer.querySelectorAll('.chapter-panel'));
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let viewerIsVisible = true;

    const panelVideos = (panel) => Array.from(panel.querySelectorAll('video'));

    const pausePanel = (panel) => {
      panelVideos(panel).forEach((video) => video.pause());
    };

    const playPanel = (panel, restart = false) => {
      if (!viewerIsVisible || reducedMotion.matches) return;
      const videos = panelVideos(panel);
      const rate = Number(panel.dataset.playbackRate || 1);

      videos.forEach((video) => {
        video.playbackRate = rate;
        if (restart) video.currentTime = 0;
        video.play().catch(() => {});
      });
    };

    panels.forEach((panel) => {
      const videos = panelVideos(panel);
      const master = videos[0];
      if (!master) return;

      master.addEventListener('ended', () => {
        if (panel.hidden || !viewerIsVisible || reducedMotion.matches) return;
        const rate = Number(panel.dataset.playbackRate || 1);
        videos.forEach((video) => {
          video.currentTime = 0;
          video.playbackRate = rate;
          video.play().catch(() => {});
        });
      });
    });

    const activateChapter = (tab, restart = true) => {
      tabs.forEach((item) => {
        const selected = item === tab;
        item.classList.toggle('is-active', selected);
        item.setAttribute('aria-selected', String(selected));
        item.tabIndex = selected ? 0 : -1;
      });

      panels.forEach((panel) => {
        const selected = panel.id === tab.dataset.chapter;
        panel.classList.toggle('is-active', selected);
        panel.hidden = !selected;
        if (selected) playPanel(panel, restart);
        else pausePanel(panel);
      });
    };

    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => activateChapter(tab));
      tab.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();

        let nextIndex = index;
        if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
        if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = tabs.length - 1;
        tabs[nextIndex].focus();
        activateChapter(tabs[nextIndex]);
      });
    });

    const visibilityObserver = new IntersectionObserver((entries) => {
      viewerIsVisible = entries[0].isIntersecting;
      const activePanel = panels.find((panel) => !panel.hidden);
      if (!activePanel) return;

      if (viewerIsVisible) playPanel(activePanel);
      else {
        pausePanel(activePanel);
      }
    }, { threshold: 0.15 });

    visibilityObserver.observe(chapterViewer);
    reducedMotion.addEventListener('change', () => {
      const activePanel = panels.find((panel) => !panel.hidden);
      if (!activePanel) return;
      if (reducedMotion.matches) pausePanel(activePanel);
      else playPanel(activePanel);
    });

    activateChapter(tabs[0], true);
  }

  const resultsGallery = document.querySelector('[data-results-gallery]');
  if (resultsGallery) {
    const galleryTabs = Array.from(document.querySelectorAll('.gallery-chapter-tab'));
    const galleryPanels = Array.from(resultsGallery.querySelectorAll('.results-gallery-panel'));
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let galleryIsVisible = false;

    const panelVideos = (panel) => Array.from(panel.querySelectorAll('video'));

    const pausePanel = (panel) => panelVideos(panel).forEach((video) => video.pause());

    const playPanel = (panel, restart = false) => {
      if (!galleryIsVisible || reducedMotion.matches) return;
      const rate = Number(panel.dataset.playbackRate || 1);
      panelVideos(panel).forEach((video) => {
        video.playbackRate = rate;
        if (restart) video.currentTime = 0;
        video.play().catch(() => {});
      });
    };

    const activatePanel = (tab) => {
      galleryTabs.forEach((item) => {
        const selected = item === tab;
        item.classList.toggle('is-active', selected);
        item.setAttribute('aria-selected', String(selected));
        item.tabIndex = selected ? 0 : -1;
      });

      galleryPanels.forEach((panel) => {
        const selected = panel.id === tab.dataset.galleryPanel;
        panel.hidden = !selected;
        panel.classList.toggle('is-active', selected);
        if (selected) playPanel(panel, true);
        else pausePanel(panel);
      });
    };

    galleryTabs.forEach((tab, index) => {
      tab.addEventListener('click', () => activatePanel(tab));
      tab.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        let nextIndex = index;
        if (event.key === 'ArrowLeft') nextIndex = (index - 1 + galleryTabs.length) % galleryTabs.length;
        if (event.key === 'ArrowRight') nextIndex = (index + 1) % galleryTabs.length;
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = galleryTabs.length - 1;
        galleryTabs[nextIndex].focus();
        activatePanel(galleryTabs[nextIndex]);
      });
    });

    resultsGallery.querySelectorAll('[data-result-card]').forEach((card) => {
      const resultVideo = card.querySelector('[data-result-video]');
      const lightVideo = card.querySelector('[data-light-video]');
      const activeLabel = card.querySelector('[data-active-condition]');
      const buttons = Array.from(card.querySelectorAll('.result-condition'));

      buttons.forEach((button) => {
        button.addEventListener('click', () => {
          buttons.forEach((item) => {
            const selected = item === button;
            item.classList.toggle('is-active', selected);
            item.setAttribute('aria-pressed', String(selected));
          });

          resultVideo.src = button.dataset.mainSrc;
          lightVideo.src = button.dataset.lightSrc;
          lightVideo.classList.toggle('is-envmap', button.dataset.envmap === 'true');
          activeLabel.textContent = button.dataset.label;

          const panel = card.closest('.results-gallery-panel');
          const rate = Number(panel.dataset.playbackRate || 1);
          resultVideo.playbackRate = rate;
          lightVideo.playbackRate = rate;

          if (galleryIsVisible && !reducedMotion.matches && !panel.hidden) {
            resultVideo.play().catch(() => {});
            lightVideo.play().catch(() => {});
          }
        });
      });
    });

    const galleryObserver = new IntersectionObserver((entries) => {
      galleryIsVisible = entries[0].isIntersecting;
      const activePanel = galleryPanels.find((panel) => !panel.hidden);
      if (!activePanel) return;
      if (galleryIsVisible) playPanel(activePanel);
      else pausePanel(activePanel);
    }, { threshold: 0.08 });

    galleryObserver.observe(resultsGallery);
    reducedMotion.addEventListener('change', () => {
      const activePanel = galleryPanels.find((panel) => !panel.hidden);
      if (!activePanel) return;
      if (reducedMotion.matches) pausePanel(activePanel);
      else playPanel(activePanel);
    });

    activatePanel(galleryTabs[0]);
  }

  const copyButton = document.querySelector('[data-copy-target]');
  if (copyButton) {
    copyButton.addEventListener('click', async () => {
      const target = document.getElementById(copyButton.dataset.copyTarget);
      if (!target) return;

      try {
        await navigator.clipboard.writeText(target.textContent);
        const label = copyButton.querySelector('span');
        label.textContent = 'Copied';
        window.setTimeout(() => { label.textContent = 'Copy'; }, 1600);
      } catch (error) {
        console.warn('Could not copy citation.', error);
      }
    });
  }
});
