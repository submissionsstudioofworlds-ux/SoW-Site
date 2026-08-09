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

const navToggle = document.querySelector('.nav-toggle');
const mobileNav = document.getElementById('mobile-nav');

if (navToggle && mobileNav) {
  const closeMobileNav = () => {
    mobileNav.hidden = true;
    navToggle.setAttribute('aria-expanded', 'false');
  };
  const openMobileNav = () => {
    mobileNav.hidden = false;
    navToggle.setAttribute('aria-expanded', 'true');
  };

  navToggle.addEventListener('click', () => {
    if (mobileNav.hidden) openMobileNav();
    else closeMobileNav();
  });

  mobileNav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', closeMobileNav);
  });

  document.addEventListener('click', (e) => {
    if (!mobileNav.hidden && !mobileNav.contains(e.target) && !navToggle.contains(e.target)) {
      closeMobileNav();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !mobileNav.hidden) {
      closeMobileNav();
      navToggle.focus();
    }
  });
}
