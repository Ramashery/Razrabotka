/**
 * home.js
 * Vanilla-JS behaviour for the rebranded home page (Jinja2/Firestore stack).
 * Replaces the Vue/Nuxt runtime the original design relied on — same visual
 * language (see /home.css), but framework-free.
 * Loaded only on the home page (see home_template.html), after /main.js.
 */
(function () {
    'use strict';

    /* ---------- Scroll-reveal (-a-to-top / -a-streight / -a-scale-in / -opacity) ---------- */
    function setupScrollReveal() {
        const targets = document.querySelectorAll(
            '.-a-to-top, .-a-streight, .-a-scale-in, .-opacity, .-a-to-bottom'
        );
        if (!targets.length) return;

        if (!('IntersectionObserver' in window)) {
            targets.forEach((el) => el.classList.add('-inview'));
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('-inview');
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.15, rootMargin: '0px 0px -10% 0px' }
        );

        targets.forEach((el) => observer.observe(el));
    }

    /* ---------- Design-statement rotating words ---------- */
    function setupDesignWordsRotator() {
        const list = document.getElementById('design-words-list');
        if (!list) return;
        const slides = Array.from(list.querySelectorAll('.slide'));
        if (slides.length < 2) return;

        let current = 0;
        setInterval(() => {
            slides[current].classList.remove('-active');
            current = (current + 1) % slides.length;
            slides[current].classList.add('-active');
        }, 2600);
    }

    /* ---------- Testimonials slider ---------- */
    function setupTestimonialsSlider() {
        const wrap = document.getElementById('testimonial-slider');
        if (!wrap) return;
        const slides = Array.from(wrap.querySelectorAll('.testimonial'));
        const prevBtn = wrap.querySelector('.prev');
        const nextBtn = wrap.querySelector('.next');
        const pageEl = document.getElementById('testimonial-page-current');
        if (slides.length < 2) return;

        let current = 0;
        function show(index) {
            slides[current].classList.remove('-active');
            current = (index + slides.length) % slides.length;
            slides[current].classList.add('-active');
            if (pageEl) pageEl.textContent = String(current + 1);
        }
        if (prevBtn) prevBtn.addEventListener('click', () => show(current - 1));
        if (nextBtn) nextBtn.addEventListener('click', () => show(current + 1));
    }

    /* ---------- Mobile menu toggle ---------- */
    function setupMobileMenu() {
        const toggle = document.getElementById('menu-toggle');
        const panel = document.getElementById('mobile-menu');
        if (!toggle || !panel) return;

        toggle.addEventListener('click', () => {
            const isOpen = !panel.hasAttribute('hidden');
            if (isOpen) {
                panel.setAttribute('hidden', '');
                toggle.classList.remove('-active');
                toggle.setAttribute('aria-expanded', 'false');
                document.body.style.overflow = '';
            } else {
                panel.removeAttribute('hidden');
                toggle.classList.add('-active');
                toggle.setAttribute('aria-expanded', 'true');
                document.body.style.overflow = 'hidden';
            }
        });

        panel.querySelectorAll('a').forEach((a) => {
            a.addEventListener('click', () => {
                panel.setAttribute('hidden', '');
                toggle.classList.remove('-active');
                toggle.setAttribute('aria-expanded', 'false');
                document.body.style.overflow = '';
            });
        });
    }

    /* ---------- Init ---------- */
    function init() {
        setupScrollReveal();
        setupDesignWordsRotator();
        setupTestimonialsSlider();
        setupMobileMenu();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
