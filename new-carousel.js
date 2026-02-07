/* new-carousel.js */

function initGlowCarousel(carouselId) {
    const container = document.getElementById(carouselId);
    if (!container) {
        // Если контейнера нет, просто выходим, это нормально при навигации
        return null;
    }

    const cards = container.querySelectorAll('.card');
    const cardLinks = container.querySelectorAll('.card-link');
    const leftArrow = container.querySelector('.nav-arrow.left');
    const rightArrow = container.querySelector('.nav-arrow.right');
    const dotsContainer = container.querySelector('.dots');
    
    // Скрываем контейнер, если нет слайдов
    if (cards.length === 0) {
        container.style.display = 'none';
        return null;
    }

    let currentIndex = 0;
    let isAnimating = false;
    let mouseMoveTimeout;
    let isLightTheme = false; // Можно поменять на true, если хотите светлую тему по умолчанию

    // Генерация точек
    if (dotsContainer) {
        dotsContainer.innerHTML = '';
        for (let i = 0; i < cards.length; i++) {
            const dot = document.createElement('div');
            dot.classList.add('dot');
            if (i === 0) dot.classList.add('active');
            dot.addEventListener('click', (e) => {
                e.stopPropagation(); // Предотвращаем всплытие
                updateCarousel(i);
            });
            dotsContainer.appendChild(dot);
        }
    }
    const dots = dotsContainer ? dotsContainer.querySelectorAll('.dot') : [];

    // Утилиты
    const round = (v) => parseFloat(v.toFixed(3));
    const clamp = (v, min = 0, max = 100) => Math.min(Math.max(v, min), max);
    
    const centerOf = ($el) => { 
        const rect = $el.getBoundingClientRect(); 
        return [rect.width / 2, rect.height / 2]; 
    };
    
    const pointerPos = ($el, e) => { 
        const rect = $el.getBoundingClientRect(); 
        const x = e.clientX - rect.left; 
        const y = e.clientY - rect.top; 
        return { 
            pX: clamp((100 / rect.width) * x), 
            pY: clamp((100 / rect.height) * y), 
            x, y 
        }; 
    };
    
    const angleFrom = (dx, dy) => { 
        let angle = 0; 
        if (dx !== 0 || dy !== 0) { 
            angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90; 
            if (angle < 0) angle += 360; 
        } 
        return angle; 
    };
    
    const distFromCenter = ($card, x, y) => { 
        const [cx, cy] = centerOf($card); 
        return [x - cx, y - cy]; 
    };
    
    const closeness = ($card, x, y) => { 
        const [cx, cy] = centerOf($card); 
        const [dx, dy] = distFromCenter($card, x, y); 
        let kx = Infinity, ky = Infinity; 
        if (dx !== 0) kx = cx / Math.abs(dx); 
        if (dy !== 0) ky = cy / Math.abs(dy); 
        return clamp(1 / Math.min(kx, ky), 0, 1); 
    };

    // Анимация чисел
    function animate(options) {
        const { duration = 1000, onUpdate = () => {}, onEnd = () => {} } = options;
        const start = performance.now();
        function frame() {
            const now = performance.now();
            const t = Math.min((now - start) / duration, 1);
            onUpdate(t);
            if (t < 1) requestAnimationFrame(frame);
            else onEnd();
        }
        requestAnimationFrame(frame);
    }

    // Анимация свечения
    function playGlow($card) {
        if (!$card) return;
        $card.classList.add('animating');
        animate({
            duration: 1200,
            onUpdate: (t) => {
                const angle = 110 + (465 - 110) * t;
                $card.style.setProperty('--pointer-°', `${angle}deg`);
                $card.style.setProperty('--pointer-d', t * 100);
            },
            onEnd: () => setTimeout(() => $card.classList.remove('animating'), 200)
        });
    }

    // Обработка движения мыши
    cards.forEach(card => {
        card.addEventListener("pointermove", (e) => {
            if (card.classList.contains('animating')) return;
            clearTimeout(mouseMoveTimeout);
            mouseMoveTimeout = setTimeout(() => {
                const pos = pointerPos(card, e);
                const [dx, dy] = distFromCenter(card, pos.x, pos.y);
                const angle = angleFrom(dx, dy);
                const edge = closeness(card, pos.x, pos.y);
                
                card.style.setProperty('--pointer-°', `${round(angle)}deg`);
                card.style.setProperty('--pointer-d', `${round(edge * 100)}`);
            }, 16);
        });
    });

    // Переключение темы
    function toggleTheme() {
        isLightTheme = !isLightTheme;
        cards.forEach(card => card.classList.toggle('light-theme', isLightTheme));
    }

    container.querySelectorAll('.sun, .moon').forEach(icon => {
        icon.addEventListener('click', (e) => { 
            e.preventDefault();
            e.stopPropagation(); 
            toggleTheme(); 
        });
    });

    // Логика обновления карусели
    function updateCarousel(newIndex) {
        if (isAnimating) return;
        isAnimating = true;
        currentIndex = (newIndex + cards.length) % cards.length;

        cards.forEach((card, i) => {
            const offset = (i - currentIndex + cards.length) % cards.length;
            
            // Сброс классов
            card.classList.remove("center", "left-1", "left-2", "right-1", "right-2", "hidden");
            if (isLightTheme) card.classList.add('light-theme');

            if (offset === 0) card.classList.add("center");
            else if (offset === 1) card.classList.add("right-1");
            else if (offset === 2) card.classList.add("right-2");
            else if (offset === cards.length - 1) card.classList.add("left-1");
            else if (offset === cards.length - 2) card.classList.add("left-2");
            else card.classList.add("hidden");
        });

        dots.forEach((dot, i) => {
            if (i === currentIndex) dot.classList.add("active");
            else dot.classList.remove("active");
        });

        setTimeout(() => { 
            playGlow(cards[currentIndex]); 
            isAnimating = false; 
        }, 300);
    }

    // Навигация по стрелкам
    if (leftArrow) leftArrow.addEventListener("click", () => updateCarousel(currentIndex - 1));
    if (rightArrow) rightArrow.addEventListener("click", () => updateCarousel(currentIndex + 1));
    
    // Клик по карточкам и ссылкам
    // Если кликнули по боковой карточке -> центрируем её.
    // Если по центральной (и это ссылка) -> переход по ссылке сработает сам.
    const clickTargets = cardLinks.length > 0 ? cardLinks : cards;
    
    clickTargets.forEach((target, i) => {
        target.addEventListener('click', (e) => {
            // Определяем индекс родительской карточки, если target это ссылка
            const cardIndex = Array.from(cards).indexOf(target.closest('.card') || target);
            
            if (cardIndex !== currentIndex) {
                e.preventDefault(); // Блокируем переход по ссылке
                updateCarousel(cardIndex); // Центрируем
            }
            // Иначе (если это центр), браузер сам перейдет по ссылке
        });
    });

    // Клавиатура
    const handleKey = (e) => {
        // Проверяем, видна ли карусель, чтобы не перехватывать клавиши зря
        if (container.offsetParent === null) return;
        
        if (e.key === "ArrowLeft") updateCarousel(currentIndex - 1);
        else if (e.key === "ArrowRight") updateCarousel(currentIndex + 1);
    };
    document.addEventListener("keydown", handleKey);

    // Свайпы
    let touchStartX = 0, touchStartY = 0;
    container.addEventListener("touchstart", (e) => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });
    
    container.addEventListener("touchend", (e) => {
        const touchEndX = e.changedTouches[0].screenX;
        const touchEndY = e.changedTouches[0].screenY;
        const diffX = touchStartX - touchEndX;
        const diffY = Math.abs(touchStartY - touchEndY);
        
        // Только если горизонтальное движение больше вертикального
        if (Math.abs(diffX) > 50 && Math.abs(diffX) > diffY) {
            if (diffX > 0) updateCarousel(currentIndex + 1);
            else updateCarousel(currentIndex - 1);
        }
    }, { passive: true });

    // Инициализация (первый запуск)
    updateCarousel(0);
    setTimeout(() => playGlow(cards[0]), 500);

    // Возвращаем объект для управления (если нужно удалять листенеры)
    return { 
        destroy: () => {
            document.removeEventListener("keydown", handleKey);
        } 
    };
}

// !!! ВАЖНО: Делаем функцию глобальной, чтобы main.js мог её вызвать !!!
window.initGlowCarousel = initGlowCarousel;