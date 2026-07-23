const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });

document.querySelectorAll('[data-reveal] .world-card').forEach((card, i) => {
  card.style.transitionDelay = `${(i % 3) * 60}ms`;
  revealObserver.observe(card);
});
