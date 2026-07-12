// =====================================================================
// main.js — ТОЛЬКО клиентская интерактивность.
//
// Всё, что можно было вычислить на этапе сборки (SEO-теги, меню, футер,
// фон, карточки услуг/портфолио/блога/контактов, related-posts, TOC,
// разметка карусели, роутинг детальных страниц, загрузка данных из
// Firebase) теперь генерируется один раз в generate_site.py и уже лежит
// в готовом HTML. main.js отвечает только за то, что физически не может
// произойти во время сборки: клики, скролл, свайпы, анимации, расчёт
// квиза.
//
// ВАЖНО: SPA-роутинг (перехват кликов по ссылкам и подмена контента без
// перезагрузки) убран сознательно — все страницы теперь полноценные
// статические HTML-файлы, обычный переход браузера работает корректно.
// =====================================================================

const mainContentEl = document.querySelector('main');
let floatingObserver, animateOnceObserver, animateAlwaysObserver;

// --- INTERSECTION OBSERVER (анимации при скролле, ленивая загрузка) ---
function setupObservers() {
    if (floatingObserver) floatingObserver.disconnect();
    if (animateOnceObserver) animateOnceObserver.disconnect();
    if (animateAlwaysObserver) animateAlwaysObserver.disconnect();

    floatingObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const target = entry.target;
            const isAboveViewport = entry.boundingClientRect.top < 0 && !entry.isIntersecting;
            if (entry.isIntersecting) {
                target.classList.add('is-visible');
                target.classList.remove('is-above');
            } else {
                target.classList.remove('is-visible');
                if (isAboveViewport) target.classList.add('is-above');
                else target.classList.remove('is-above');
            }
        });
    }, { threshold: 0, rootMargin: "-50px 0px -50px 0px" });

    animateOnceObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const target = entry.target;

                const lazyBackgrounds = Array.from(target.querySelectorAll('[data-bg-src]'));
                if (target.hasAttribute('data-bg-src')) lazyBackgrounds.push(target);
                lazyBackgrounds.forEach(el => {
                    el.style.backgroundImage = `url('${el.dataset.bgSrc}')`;
                    el.removeAttribute('data-bg-src');
                });

                const lazyImage = target.querySelector('img.lazy-load-image[data-src]');
                if (lazyImage) {
                    lazyImage.onload = () => {
                        lazyImage.classList.add('loaded');
                        lazyImage.onload = null;
                    };
                    lazyImage.src = lazyImage.dataset.src;
                    lazyImage.removeAttribute('data-src');
                }

                target.classList.add('is-visible');
                observer.unobserve(target);
            }
        });
    }, { threshold: 0.1, rootMargin: "0px 0px 50px 0px" });

    animateAlwaysObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) entry.target.classList.add('is-visible');
            else entry.target.classList.remove('is-visible');
        });
    }, { threshold: 0.1, rootMargin: "0px 0px -50px 0px" });

    document.querySelectorAll('.floating-item').forEach(el => floatingObserver.observe(el));
    document.querySelectorAll('.animate-on-scroll').forEach(el => animateOnceObserver.observe(el));
    document.querySelectorAll('.animate-always').forEach(el => animateAlwaysObserver.observe(el));
}

// --- ПЛАВНЫЙ ФЕЙД ФОНА (custom-background-iframe уже содержит srcdoc из Python) ---
function initCustomBackgroundFade() {
    const iframe = document.getElementById('custom-background-iframe');
    if (!iframe || iframe.style.display === 'none') return;
    iframe.onload = () => {
        iframe.classList.add('is-visible');
        iframe.onload = null;
    };
}

// --- FLOATING TOC TOGGLE ---
function initFloatingTocToggle() {
    const floatingTocWrapper = document.getElementById('floating-toc-wrapper');
    const toggleBtn = document.getElementById('toc-toggle-btn');
    const contentPanel = document.getElementById('toc-content-panel');
    if (!floatingTocWrapper || !toggleBtn || !contentPanel) return;

    const closeToc = () => {
        toggleBtn.setAttribute('aria-expanded', 'false');
        contentPanel.setAttribute('aria-hidden', 'true');
        contentPanel.classList.remove('is-visible');
        toggleBtn.classList.remove('is-active');
    };

    toggleBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
        if (isExpanded) {
            closeToc();
        } else {
            toggleBtn.setAttribute('aria-expanded', 'true');
            contentPanel.setAttribute('aria-hidden', 'false');
            contentPanel.classList.add('is-visible');
            toggleBtn.classList.add('is-active');
        }
    });

    document.addEventListener('click', (event) => {
        if (contentPanel.classList.contains('is-visible') && !floatingTocWrapper.contains(event.target)) {
            closeToc();
        }
    });

    contentPanel.addEventListener('click', (event) => {
        if (event.target.closest('a')) setTimeout(closeToc, 100);
    });
}

// --- GLOW-КАРУСЕЛЬ (контент детальных страниц, разметка уже в HTML) ---
function initializeCarousel() {
    document.querySelectorAll('.carousel-container').forEach(root => {
        if (root.id && typeof window.initGlowCarousel === 'function') {
            window.initGlowCarousel(root.id);
        }
    });
}

// --- КВИЗ ---
function calculateQuizResult() {
    const quizForm = document.getElementById('business-quiz');
    if (!quizForm) return;

    const selectedAnswers = quizForm.querySelectorAll('input[type="radio"]:checked');
    if (selectedAnswers.length < 8) {
        alert('Please answer all 8 questions to get your result.');
        return;
    }

    let scores = { landing: 0, website: 0, hybrid: 0 };
    selectedAnswers.forEach(answer => { scores[answer.value]++; });

    const resultDiv = document.getElementById('quiz-result');
    if (!resultDiv) return;

    let resultHTML = '', resultStyle = '';

    if (scores.hybrid >= 5 || (scores.hybrid >= scores.landing && scores.hybrid >= scores.website)) {
        resultHTML = `<h3>Your Result: Hybrid Approach</h3><p>Consider a phased approach: start with a core website (5-8 pages) and add campaign-specific landing pages as needed. This balances long-term brand building with short-term conversion optimization.</p>`;
        resultStyle = 'background-color: rgba(255, 251, 230, 0.1); border-color: #ffe58f;';
    } else if (scores.landing >= 5 || scores.landing > scores.website) {
        resultHTML = `<h3>Your Result: Landing Page</h3><p>You need a focused, conversion-optimized landing page. Perfect for campaigns, single offers, events, or testing new business ideas. Expected investment: $500-$2,000 for professional landing page design in Tbilisi.</p>`;
        resultStyle = 'background-color: rgba(230, 247, 255, 0.1); border-color: #91d5ff;';
    } else {
        resultHTML = `<h3>Your Result: Multi-Page Website</h3><p>You need comprehensive site development. Invest in a multi-page website to build brand credibility, rank in search engines, and support complex sales processes. Expected investment: $3,000-$15,000+ depending on features.</p>`;
        resultStyle = 'background-color: rgba(246, 255, 237, 0.1); border-color: #b7eb8f;';
    }

    resultDiv.innerHTML = resultHTML;
    resultDiv.style.cssText = resultStyle + ' margin-top: 20px; padding: 15px; border-width: 2px; border-style: solid; border-radius: 8px; display: block;';
    resultDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// --- ГЛАВНАЯ: DESKTOP-КАРУСЕЛИ (сетка карточек уже в HTML) ---
function initDesktopCarousels() {
    document.querySelectorAll('.desktop-carousel-container').forEach(carousel => {
        const slides = carousel.querySelectorAll('.desktop-grid-slide');
        const nav = carousel.nextElementSibling;
        if (!nav || !nav.matches('.desktop-slider-nav')) return;

        const dots = nav.querySelectorAll('.desktop-slider-dot');
        if (slides.length <= 1) return;

        let currentIndex = 0;
        let autoSlideInterval;

        function goToSlide(index) {
            currentIndex = (index + slides.length) % slides.length;
            slides.forEach((s, i) => s.classList.toggle('active', i === currentIndex));
            dots.forEach((d, i) => d.classList.toggle('active', i === currentIndex));
        }
        function startAutoSlide() {
            stopAutoSlide();
            autoSlideInterval = setInterval(() => goToSlide(currentIndex + 1), 7000);
        }
        function stopAutoSlide() { clearInterval(autoSlideInterval); }

        startAutoSlide();

        nav.addEventListener('click', e => {
            if (e.target.matches('.desktop-slider-dot')) {
                stopAutoSlide();
                goToSlide(parseInt(e.target.dataset.index));
                startAutoSlide();
            }
        });
    });
}

// --- ГЛАВНАЯ: MOBILE-СЛАЙДЕРЫ (свайпы) ---
function initMobileSliders() {
    document.querySelectorAll('.language-slider-block').forEach(sliderBlock => {
        const slider = sliderBlock.querySelector('.cross-fade-slider');
        const slides = slider.querySelectorAll('.item-card');
        const nav = sliderBlock.querySelector('.slider-nav');
        const dots = nav ? nav.querySelectorAll('.slider-dot') : [];

        if (slides.length <= 1) return;

        let currentIndex = 0;
        let touchStartX = 0;
        let touchStartY = 0;
        let autoSlideInterval;

        function goToSlide(index) {
            currentIndex = (index + slides.length) % slides.length;
            slides.forEach((s, i) => s.classList.toggle('active', i === currentIndex));
            dots.forEach((d, i) => d.classList.toggle('active', i === currentIndex));
        }
        function startAutoSlide() {
            stopAutoSlide();
            autoSlideInterval = setInterval(() => goToSlide(currentIndex + 1), 5000);
        }
        function stopAutoSlide() { clearInterval(autoSlideInterval); }

        startAutoSlide();

        if (nav) {
            nav.addEventListener('click', e => {
                if (e.target.matches('.slider-dot')) {
                    stopAutoSlide();
                    goToSlide(parseInt(e.target.dataset.index));
                    startAutoSlide();
                }
            });
        }

        slider.addEventListener('touchstart', e => {
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
            stopAutoSlide();
        }, { passive: true });

        slider.addEventListener('touchend', e => {
            const touchEndX = e.changedTouches[0].screenX;
            const touchEndY = e.changedTouches[0].screenY;
            const diffX = touchStartX - touchEndX;
            const diffY = Math.abs(touchStartY - touchEndY);
            const swipeThreshold = 50;

            if (Math.abs(diffX) > swipeThreshold && Math.abs(diffX) > diffY) {
                if (diffX > 0) goToSlide(currentIndex + 1);
                else goToSlide(currentIndex - 1);
            }
            startAutoSlide();
        }, { passive: true });
    });
}

// --- ПЛАВНЫЙ СКРОЛЛ К ЭЛЕМЕНТУ (переход по #якорю, TOC) ---
function scrollToElementWithOffset(elementId) {
    const element = document.getElementById(elementId);
    if (!element) return;
    let absoluteTop = 0;
    let el = element;
    while (el) { absoluteTop += el.offsetTop; el = el.offsetParent; }
    const targetPosition = absoluteTop - Math.floor(window.innerHeight * 0.25);
    window.scrollTo({ top: Math.max(0, targetPosition), behavior: 'smooth' });
}

// --- АВТООБНОВЛЕНИЕ #ХЭША ПРИ СКРОЛЛЕ (для длинных статей с TOC) ---
let scrollHashUpdateTimer = null;
function initScrollHashUpdater() {
    window.addEventListener('scroll', () => {
        if (scrollHashUpdateTimer) return;
        scrollHashUpdateTimer = setTimeout(() => {
            scrollHashUpdateTimer = null;
            const headings = document.querySelectorAll('.detail-content h2[id], .detail-content h3[id]');
            if (headings.length === 0) return;
            let bestMatch = null;
            const viewportMid = window.innerHeight / 2;
            headings.forEach(h => {
                if (h.getBoundingClientRect().top <= viewportMid) bestMatch = h;
            });
            const newHash = bestMatch ? '#' + bestMatch.id : '';
            if (newHash !== window.location.hash) {
                window.history.replaceState(null, '', window.location.pathname + window.location.search + newHash);
            }
        }, 150);
    }, { passive: true });
}

// --- КНОПКА "НАВЕРХ" ---
function updateScrollButtonVisibility() {
    const b = document.getElementById('scroll-to-top-btn');
    if (b) window.scrollY > 300 ? b.classList.add('visible') : b.classList.remove('visible');
}

// --- БАЗОВЫЕ ОБРАБОТЧИКИ КЛИКОВ (меню, наверх, квиз, якоря) ---
function initEventListeners() {
    const menuToggle = document.querySelector('.menu-toggle');
    const navOverlay = document.querySelector('.nav-overlay');

    function closeMenu() {
        document.body.classList.remove('nav-is-open');
        if (menuToggle) menuToggle.classList.remove('is-active');
        if (navOverlay) navOverlay.classList.remove('is-active');
    }

    if (menuToggle) {
        menuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            document.body.classList.toggle('nav-is-open');
            menuToggle.classList.toggle('is-active');
            if (navOverlay) navOverlay.classList.toggle('is-active');
        });
    }

    document.addEventListener('click', (e) => {
        if (!document.body.classList.contains('nav-is-open')) return;
        if (!e.target.closest('.nav-overlay') && !e.target.closest('.menu-toggle')) closeMenu();
    });

    // Клик по ссылке-якорю на текущей странице: закрыть мобильное меню
    // и плавно проскроллить (обычные переходы браузер обрабатывает сам).
    document.body.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (link && document.body.classList.contains('nav-is-open')) closeMenu();

        if (link && link.hash && link.pathname === window.location.pathname && link.host === window.location.host) {
            e.preventDefault();
            window.history.pushState({}, '', link.href);
            scrollToElementWithOffset(link.hash.substring(1));
        }
    });

    if (mainContentEl) {
        mainContentEl.addEventListener('click', (e) => {
            if (e.target.closest('#scroll-to-top-btn')) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
            if (e.target.id === 'quiz-submit-button') {
                calculateQuizResult();
            }
        });
    }
}

// --- АНИМАЦИЯ ТЕКСТА НА ДЕТАЛЬНЫХ СТРАНИЦАХ ---
// content-group блоки уже готовы в статическом HTML, но класс для
// floatingObserver навешивался раньше динамически в renderDetailPage().
function markContentGroupsAsFloating() {
    document.querySelectorAll('.detail-content > .content-group').forEach(el => {
        el.classList.add('floating-item');
    });
}

// --- ИНИЦИАЛИЗАЦИЯ ---
function initApp() {
    initEventListeners();
    initScrollHashUpdater();
    window.addEventListener('scroll', updateScrollButtonVisibility, { passive: true });

    initCustomBackgroundFade();
    initFloatingTocToggle();
    initializeCarousel();
    initMobileSliders();
    initDesktopCarousels();
    markContentGroupsAsFloating();

    requestAnimationFrame(() => setupObservers());
    updateScrollButtonVisibility();

    if (window.location.hash) {
        setTimeout(() => scrollToElementWithOffset(window.location.hash.substring(1)), 300);
    }
}

window.addEventListener('DOMContentLoaded', initApp);
