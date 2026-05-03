// ==UserScript==
// @name         Bluesky Load New & Stay (Absolute Y Anchor)
// @namespace    http://tampermonkey.net/
// @version      6.0
// @description  Bouton ⚓. Fige la vue en traquant les coordonnées absolues des posts.
// @author       Toi + IA
// @match        https://bsky.app/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=bsky.app
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const POST_SELECTOR = '[data-testid^="feedItem-"], [data-testid^="postThreadItem-"]';

    function getScrollContainer(element) {
        let parent = element.parentElement;
        while (parent && parent !== document.body && parent !== document.documentElement) {
            const style = window.getComputedStyle(parent);
            if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
                return parent;
            }
            parent = parent.parentElement;
        }
        return window;
    }

    function injectStayButton(originalBtn) {
        originalBtn.setAttribute('data-stay-processed', 'true');
        const parent = originalBtn.parentNode;

        parent.style.display = 'flex';
        parent.style.flexDirection = 'row';
        parent.style.gap = '10px';

        const stayBtn = originalBtn.cloneNode(true);
        stayBtn.setAttribute('aria-label', 'Load new and stay');
        stayBtn.removeAttribute('data-stay-processed');

        stayBtn.style.backgroundColor = "#208bfe";
        stayBtn.style.borderColor = "#208bfe";
        stayBtn.innerHTML = '<span style="color:white; font-size:18px; line-height:1; display:flex; align-items:center; justify-content:center; width:100%; height:100%;">⚓</span>';

        stayBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleLoadAndStay(originalBtn);
        });

        parent.appendChild(stayBtn);
    }

    function handleLoadAndStay(originalBtn) {
        const scrollContainer = getScrollContainer(originalBtn);
        const isWindow = scrollContainer === window;

        const getScroll = () => isWindow ? (window.scrollY || document.documentElement.scrollTop) : scrollContainer.scrollTop;
        const getHeight = () => isWindow ? document.documentElement.scrollHeight : scrollContainer.scrollHeight;

        let isScriptScrolling = false;
        const safeSetScroll = (val) => {
            isScriptScrolling = true;
            if (isWindow) {
                window.scrollTo({ top: val, behavior: 'instant' });
            } else {
                scrollContainer.scrollTop = val;
            }
            // Petit délai pour laisser le navigateur peindre la frame
            setTimeout(() => { isScriptScrolling = false; }, 0);
        };

        // 1. On capture l'état initial (les 3 posts les plus hauts à l'écran)
        const posts = Array.from(document.querySelectorAll(POST_SELECTOR));
        const visiblePosts = posts.filter(p => {
            const rect = p.getBoundingClientRect();
            return rect.top >= 40 && rect.top < window.innerHeight;
        });

        const currentScroll = getScroll();
        let expectedScroll = currentScroll;
        let lastHeight = getHeight();

        // On calcule la coordonnée Absolue Y (Scroll actuel + Position dans l'écran)
        let anchors = visiblePosts.slice(0, 3).map(post => ({
            id: post.getAttribute('data-testid'),
            absoluteY: currentScroll + post.getBoundingClientRect().top
        }));

        let isActive = true;

        // 2. On bloque les tentatives de Bluesky de nous ramener à 0 brutalement
        const origWindowScrollTo = window.scrollTo;
        const origElementScrollTo = Element.prototype.scrollTo;

        const blockScroll = function() {
            if (!isActive || isScriptScrolling) {
                if (this === window) origWindowScrollTo.apply(this, arguments);
                else origElementScrollTo.apply(this, arguments);
                return;
            }

            let arg0 = arguments[0];
            let targetTop = (typeof arg0 === 'object' && arg0 !== null) ? arg0.top : arg0;

            // Si Bluesky essaie de forcer le scroll tout en haut, on l'annule
            if (targetTop !== undefined && targetTop < expectedScroll - 100) {
                return;
            }

            if (this === window) origWindowScrollTo.apply(this, arguments);
            else origElementScrollTo.apply(this, arguments);
        };

        window.scrollTo = blockScroll;
        Element.prototype.scrollTo = blockScroll;

        // 3. On déclenche le vrai chargement
        originalBtn.click();

        // 4. Boucle de surveillance fluide (60 FPS)
        function loop() {
            if (!isActive) return;

            let actualScroll = getScroll();
            let currentHeight = getHeight();
            let shiftDelta = 0;

            // Détection si c'est l'utilisateur qui scrolle à la main
            if (actualScroll !== expectedScroll) {
                if (Math.abs(actualScroll - expectedScroll) < 200 && currentHeight === lastHeight) {
                    expectedScroll = actualScroll; // On accepte le scroll manuel
                } else if (actualScroll < expectedScroll - 100) {
                    // Fallback si Bluesky a hacké le scroll avec une autre méthode
                    safeSetScroll(expectedScroll);
                    actualScroll = expectedScroll;
                }
            }

            // On cherche de combien les ancrent ont bougé en absolu
            let foundAnchor = false;
            for (let anchor of anchors) {
                let el = document.querySelector(`[data-testid="${anchor.id}"]`);
                if (el) {
                    let currentAbsoluteY = actualScroll + el.getBoundingClientRect().top;
                    shiftDelta = currentAbsoluteY - anchor.absoluteY;

                    if (Math.abs(shiftDelta) > 1) {
                        foundAnchor = true;
                        break;
                    }
                }
            }

            // Fallback si la page s'est tellement agrandie que les posts originaux ont été supprimés
            if (!foundAnchor && currentHeight > lastHeight) {
                shiftDelta = currentHeight - lastHeight;
            }

            // Si le contenu a été physiquement poussé vers le bas
            if (shiftDelta > 0) {
                expectedScroll += shiftDelta;
                safeSetScroll(expectedScroll);
                actualScroll = expectedScroll;

                // On met à jour nos coordonnées de référence
                lastHeight = currentHeight;
                for (let anchor of anchors) {
                    let el = document.querySelector(`[data-testid="${anchor.id}"]`);
                    if (el) {
                        anchor.absoluteY = actualScroll + el.getBoundingClientRect().top;
                    }
                }
            }

            requestAnimationFrame(loop);
        }

        requestAnimationFrame(loop);

        // 5. Nettoyage après 3 secondes (fin du chargement)
        setTimeout(() => {
            isActive = false;
            window.scrollTo = origWindowScrollTo;
            Element.prototype.scrollTo = origElementScrollTo;
        }, 3000);
    }

    const observer = new MutationObserver(() => {
        const btn = document.querySelector('button[aria-label*="nouveaux"]:not([data-stay-processed="true"]), button[aria-label*="new posts"]:not([data-stay-processed="true"])');
        if (btn) {
            injectStayButton(btn);
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

})();